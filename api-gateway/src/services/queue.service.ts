import Queue, { Job, JobOptions } from "bull";
import { config } from "../config";
import { logger } from "../utils/logger";
import Redis from "ioredis";

export interface TranslationJob {
  id: string;
  text: string;
  targetLanguages: string[];
  options?: {
    expandAbbreviations?: boolean;
    filterProfanity?: boolean;
    normalizeRepeats?: boolean;
    removeEmoticons?: boolean;
    fixTypos?: boolean;
  };
  createdAt: number;
}

export interface TranslationResult {
  id: string;
  originalText: string;
  preprocessedText: string;
  translations: Record<string, string>;
  detectedLanguage: string;
  processingTime: number;
  filtered: boolean;
  filterReason?: string;
}

// 전처리 결과 인터페이스
export interface PreprocessingResult {
  original_text: string;
  preprocessed_text: string;
  detected_language: string;
  preprocessing_time_ms: number;
  filtered: boolean;
  filter_reason?: string;
  emoticons?: string[];
}

class QueueService {
  private queue: Queue.Queue<TranslationJob>;
  private preprocessingResults: Map<string, PreprocessingResult> = new Map();
  private preprocessingResolvers: Map<
    string,
    (result: PreprocessingResult) => void
  > = new Map();

  // RPS 모니터링
  private queueAddCounter = 0;
  private preprocessingCompleteCounter = 0;
  private lastQueueAddRps = 0;
  private lastPreprocessingCompleteRps = 0;

  // Redis 성능 모니터링
  private redisWriteTimeSum = 0;
  private redisWriteCount = 0;
  private redisReadTimeSum = 0;
  private redisReadCount = 0;
  private lastRedisWriteAvg = 0;
  private lastRedisReadAvg = 0;

  constructor() {
    // Queue 삽입 RPS 모니터링
    setInterval(() => {
      this.lastQueueAddRps = this.queueAddCounter;
      this.lastPreprocessingCompleteRps = this.preprocessingCompleteCounter;

      // Redis 성능 평균 계산
      this.lastRedisWriteAvg =
        this.redisWriteCount > 0
          ? this.redisWriteTimeSum / this.redisWriteCount
          : 0;
      this.lastRedisReadAvg =
        this.redisReadCount > 0
          ? this.redisReadTimeSum / this.redisReadCount
          : 0;

      // logger.info({
      //   metric: "QUEUE_SERVICE",
      //   queue_add_rps: this.queueAddCounter,
      //   preprocessing_complete_rps: this.preprocessingCompleteCounter,
      //   redis_write_avg_ms: this.lastRedisWriteAvg.toFixed(2),
      //   redis_read_avg_ms: this.lastRedisReadAvg.toFixed(2),
      // });

      this.queueAddCounter = 0;
      this.preprocessingCompleteCounter = 0;
      this.redisWriteTimeSum = 0;
      this.redisWriteCount = 0;
      this.redisReadTimeSum = 0;
      this.redisReadCount = 0;
    }, 1000);
    this.queue = new Queue<TranslationJob>(config.queue.name, {
      // Bull이 Redis 클라이언트를 생성할 때 호출 (client, bclient, eclient 총 3개)
      createClient: (type) => {
        const client = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          maxRetriesPerRequest: null, // Bull 권장 설정 (blocking 명령용)
          enableReadyCheck: false, // 성능 향상
          lazyConnect: false, // 즉시 연결
          // ioredis는 단일 연결이지만 Bull이 3개(client, bclient, eclient) 생성
        });
        logger.debug(`Bull Redis client created: ${type}`);
        return client;
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 1000, // Keep last 1000 failed jobs
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        timeout: config.queue.timeout,
      },
    });

    this.setupEventHandlers();
    this.subscribeToWorker();
  }

  private setupEventHandlers() {
    this.queue.on("error", (error) => {
      logger.error({ error }, "Queue error");
    });

    this.queue.on("failed", (job, error) => {
      logger.error({ jobId: job.id, error }, "Job failed");
    });

    this.queue.on("completed", (job) => {
      logger.info({ jobId: job.id }, "Job completed");
    });

    this.queue.on("stalled", (job) => {
      logger.warn({ jobId: job.id }, "Job stalled");
    });
  }

  private subscribeToWorker() {
    const redisSub = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    // 전처리 결과 채널 구독
    const PREPROCESSING_CHANNEL = "bull:preprocessing-results:jobId";
    redisSub.subscribe(PREPROCESSING_CHANNEL, async (err, count) => {
      if (err) {
        logger.error({ err }, "Failed to subscribe to preprocessing channel");
        return;
      }
      logger.info(`Subscribed to ${PREPROCESSING_CHANNEL} (${count} channels)`);
    });

    redisSub.on("message", async (channel, message) => {
      if (channel !== PREPROCESSING_CHANNEL) return;

      try {
        const { jobId, result, status } = JSON.parse(message);
        logger.debug({
          msg: "Preprocessing result received",
          jobId,
          status,
        });

        if (status === "completed") {
          this.preprocessingCompleteCounter++; // RPS 카운터

          // 전처리 결과 저장
          this.preprocessingResults.set(jobId, result);

          // Bull job을 completed로 마킹 (통계 업데이트를 위해)
          const job = await this.getJob(jobId);
          if (job) {
            await job
              .moveToCompleted(
                JSON.stringify({
                  preprocessing: result,
                  completed_at: Date.now(),
                }),
                true,
                true
              )
              .catch((error) => {
                // 이미 completed 상태이거나 타이밍 이슈로 실패할 수 있음 (무시해도 됨)
                logger.debug(
                  { error, jobId },
                  "Job already completed or moved"
                );
              });
          }

          // 대기 중인 resolver가 있으면 호출
          const resolver = this.preprocessingResolvers.get(jobId);
          if (resolver) {
            resolver(result);
            this.preprocessingResolvers.delete(jobId);
          }
        } else if (status === "failed") {
          // Bull job을 failed로 마킹
          const job = await this.getJob(jobId);
          if (job) {
            await job
              .moveToFailed(
                { message: result?.filter_reason || "Preprocessing failed" },
                true
              )
              .catch((error) => {
                // 이미 failed 상태이거나 타이밍 이슈로 실패할 수 있음 (무시해도 됨)
                logger.debug({ error, jobId }, "Job already failed or moved");
              });
          }

          // 실패 시 resolver에게 에러 전달
          const resolver = this.preprocessingResolvers.get(jobId);
          if (resolver) {
            // reject는 따로 관리하지 않으므로, filtered=true로 처리
            const failedResult: PreprocessingResult = {
              original_text: "",
              preprocessed_text: "",
              detected_language: "unknown",
              preprocessing_time_ms: 0,
              filtered: true,
              filter_reason: result?.filter_reason || "Preprocessing failed",
            };
            resolver(failedResult);
            this.preprocessingResolvers.delete(jobId);
          }
        }
      } catch (err) {
        logger.error({ err }, "Error processing Python preprocessing message");
      }
    });
  }

  async addJob(
    data: TranslationJob,
    options?: JobOptions
  ): Promise<Job<TranslationJob>> {
    this.queueAddCounter++; // RPS 카운터

    const startTime = performance.now();
    const job = await this.queue.add(data, {
      jobId: data.id,
      ...options,
    });
    const duration = performance.now() - startTime;

    // Redis 쓰기 시간 측정
    this.redisWriteTimeSum += duration;
    this.redisWriteCount++;

    logger.debug({ jobId: job.id, text: data.text }, "Job added to queue");
    return job;
  }

  async getJob(jobId: string): Promise<Job<TranslationJob> | null> {
    return this.queue.getJob(jobId);
  }

  /**
   * 전처리 결과 대기
   */
  async waitForPreprocessing(
    jobId: string,
    timeout: number = config.queue.timeout
  ): Promise<PreprocessingResult> {
    // 이미 결과가 있으면 즉시 반환
    const cached = this.preprocessingResults.get(jobId);
    if (cached) {
      this.preprocessingResults.delete(jobId); // 사용 후 삭제
      return cached;
    }

    // Promise로 대기
    return Promise.race([
      new Promise<PreprocessingResult>((resolve) => {
        this.preprocessingResolvers.set(jobId, resolve);
      }),
      new Promise<PreprocessingResult>((_, reject) =>
        setTimeout(() => reject(new Error("Preprocessing timeout")), timeout)
      ),
    ]);
  }

  async getQueueStats() {
    const startTime = performance.now();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    const duration = performance.now() - startTime;

    // Redis 읽기 시간 측정
    this.redisReadTimeSum += duration;
    this.redisReadCount++;

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  async getDetailedStats() {
    const redisStartTime = performance.now();
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      activeJobs,
      waitingJobs,
      completedJobs,
      failedJobs,
    ] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getPausedCount(),
      this.queue.getActive(0, 50), // 최대 50개 active jobs 확인
      this.queue.getWaiting(0, 50), // 최대 50개 waiting jobs 확인
      this.queue.getCompleted(0, 10), // 최근 10개 completed jobs
      this.queue.getFailed(0, 10), // 최근 10개 failed jobs
    ]);
    const redisReadDuration = performance.now() - redisStartTime;

    // Redis 읽기 시간 측정
    this.redisReadTimeSum += redisReadDuration;
    this.redisReadCount++;

    const now = Date.now();

    // Stuck 판단 기준 (ms) - 전처리 전용으로 조정
    const ACTIVE_STUCK_THRESHOLD = 5000; // 5초 이상 처리 중 (전처리는 빠름)
    const WAITING_STUCK_THRESHOLD = 10000; // 10초 이상 대기

    // Stuck active jobs (처리 중인데 너무 오래 걸리는 것들)
    const stuckActiveJobs = activeJobs.filter((job) => {
      const elapsedMs = job.processedOn ? now - job.processedOn : 0;
      return elapsedMs > ACTIVE_STUCK_THRESHOLD;
    });

    // Stuck waiting jobs (대기 중인데 너무 오래 대기하는 것들)
    const stuckWaitingJobs = waitingJobs.filter((job) => {
      const waitingMs = now - job.timestamp;
      return waitingMs > WAITING_STUCK_THRESHOLD;
    });

    // 처리 시간 통계 계산 (completed jobs 기준)
    const processingTimes = completedJobs
      .filter((job) => job.finishedOn && job.processedOn)
      .map((job) => job.finishedOn! - job.processedOn!);

    const avgProcessingTime =
      processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;

    // Throughput 계산 (최근 completed jobs 기준)
    const recentCompletedJobs = completedJobs.filter(
      (job) => job.finishedOn && now - job.finishedOn < 60000 // 최근 1분
    );
    const throughputPerMinute = recentCompletedJobs.length;

    return {
      counts: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
        total: waiting + active + completed + failed + delayed,
      },
      performance: {
        avgProcessingTimeMs: Math.round(avgProcessingTime),
        throughputPerMinute,
      },
      redis: {
        writeAvgMs: parseFloat(this.lastRedisWriteAvg.toFixed(2)),
        readAvgMs: parseFloat(this.lastRedisReadAvg.toFixed(2)),
        lastQueryMs: parseFloat(redisReadDuration.toFixed(2)),
      },
      stuck: {
        activeCount: stuckActiveJobs.length,
        waitingCount: stuckWaitingJobs.length,
        totalStuck: stuckActiveJobs.length + stuckWaitingJobs.length,
        stuckActiveJobs: stuckActiveJobs.map((job) => ({
          id: job.id,
          text: job.data?.text?.substring(0, 50) || "N/A",
          targetLanguages: job.data?.targetLanguages || [],
          startedAt: job.processedOn,
          elapsedMs: job.processedOn ? now - job.processedOn : 0,
          stuckForSeconds: job.processedOn
            ? Math.round((now - job.processedOn) / 1000)
            : 0,
        })),
        stuckWaitingJobs: stuckWaitingJobs.map((job) => ({
          id: job.id,
          text: job.data?.text?.substring(0, 50) || "N/A",
          targetLanguages: job.data?.targetLanguages || [],
          createdAt: job.timestamp,
          waitingMs: now - job.timestamp,
          waitingForSeconds: Math.round((now - job.timestamp) / 1000),
        })),
      },
      activeJobs: activeJobs.slice(0, 10).map((job) => ({
        id: job.id,
        text: job.data?.text?.substring(0, 50) || "N/A",
        targetLanguages: job.data?.targetLanguages || [],
        startedAt: job.processedOn,
        elapsedMs: job.processedOn ? now - job.processedOn : 0,
      })),
      waitingJobs: waitingJobs.slice(0, 10).map((job) => ({
        id: job.id,
        text: job.data?.text?.substring(0, 50) || "N/A",
        targetLanguages: job.data?.targetLanguages || [],
        waitingMs: now - job.timestamp,
      })),
      recentCompleted: completedJobs.slice(0, 5).map((job) => ({
        id: job.id,
        text: job.data?.text?.substring(0, 50) || "N/A",
        processingTimeMs:
          job.finishedOn && job.processedOn
            ? job.finishedOn - job.processedOn
            : 0,
      })),
      recentFailed: failedJobs.slice(0, 5).map((job) => ({
        id: job.id,
        text: job.data?.text?.substring(0, 50) || "N/A",
        error: job.failedReason,
      })),
    };
  }

  async completeJob(jobId: string, result: TranslationResult, error: string) {
    const now = performance.now();
    try {
      const job = await this.getJob(jobId);
      if (!job) return;
      console.log(jobId, "completejob");
      if (error) {
        await job.moveToFailed({ message: error }, true);
      } else {
        await job
          .moveToCompleted(JSON.stringify(result), true, true)
          .catch((error) => {
            console.log("completeJob moveToCompleted error", error);
          });
      }
    } catch (error) {
      console.log("completeJob error throw", performance.now() - now);
      logger.error({ error }, "Failed to complete job");
    }
  }

  async failedJob(jobId: string) {
    try {
      const job = await this.getJob(jobId);
      if (!job) return;
      await job.moveToFailed({ message: "Job failed" }, true);
    } catch (error) {
      logger.error({ error }, "Failed to complete job");
    }
  }

  async close() {
    await this.queue.close();
    logger.info("Queue closed");
  }

  // RPS 조회 함수
  getRpsMetrics() {
    return {
      add: this.lastQueueAddRps,
      preprocessingComplete: this.lastPreprocessingCompleteRps,
    };
  }
}

export const queueService = new QueueService();
