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

class QueueService {
  private queue: Queue.Queue<TranslationJob>;

  constructor() {
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
    const CHANNEL = "bull:translation-results:jobId";
    // 구독
    redisSub.subscribe(CHANNEL, async (err, count) => {
      if (err) {
        console.error("Failed to subscribe: ", err);
        return;
      }
      logger.info(`Subscribed to ${CHANNEL} (${count} channels)`);
    });

    redisSub.on("message", async (channel, message) => {
      if (channel !== CHANNEL) return;
      // const time = performance.now();

      try {
        console.log("message get", message);
        const { jobId, result, status } = JSON.parse(message);
        // console.log("message json parse", performance.now() - time, result);
        // getJob 생략 - result 받았으면 job 존재 확정
        console.log("bull job", jobId, result, status);
        if (status === "completed") {
          await queueService.completeJob(jobId, result, "");
        } else if (status === "failed") {
          await queueService.failedJob(jobId);
        }
        // console.log("completeJob", performance.now() - time);
      } catch (err) {
        logger.error("Error processing Python completion message:", err);
      }
    });
  }

  async addJob(
    data: TranslationJob,
    options?: JobOptions
  ): Promise<Job<TranslationJob>> {
    const job = await this.queue.add(data, {
      jobId: data.id,
      ...options,
    });

    logger.debug({ jobId: job.id, text: data.text }, "Job added to queue");
    return job;
  }

  async getJob(jobId: string): Promise<Job<TranslationJob> | null> {
    return this.queue.getJob(jobId);
  }

  async waitForResult(
    jobId: string,
    timeout: number = config.queue.timeout
  ): Promise<TranslationResult> {
    const job = await this.getJob(jobId);
    // logger.info({ jobId, job }, "Waiting for result");
    // console.log(job, jobId, "@@@");
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return Promise.race([
      job.finished() as Promise<TranslationResult>,
      new Promise<TranslationResult>((_, reject) =>
        setTimeout(() => reject(new Error("Job timeout")), timeout)
      ),
    ]);
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

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

    const now = Date.now();

    // Stuck 판단 기준 (ms)
    const ACTIVE_STUCK_THRESHOLD = 30000; // 30초 이상 처리 중
    const WAITING_STUCK_THRESHOLD = 60000; // 1분 이상 대기

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
      stuck: {
        activeCount: stuckActiveJobs.length,
        waitingCount: stuckWaitingJobs.length,
        totalStuck: stuckActiveJobs.length + stuckWaitingJobs.length,
        stuckActiveJobs: stuckActiveJobs.map((job) => ({
          id: job.id,
          text: job.data.text.substring(0, 50),
          targetLanguages: job.data.targetLanguages,
          startedAt: job.processedOn,
          elapsedMs: job.processedOn ? now - job.processedOn : 0,
          stuckForSeconds: job.processedOn
            ? Math.round((now - job.processedOn) / 1000)
            : 0,
        })),
        stuckWaitingJobs: stuckWaitingJobs.map((job) => ({
          id: job.id,
          text: job.data.text.substring(0, 50),
          targetLanguages: job.data.targetLanguages,
          createdAt: job.timestamp,
          waitingMs: now - job.timestamp,
          waitingForSeconds: Math.round((now - job.timestamp) / 1000),
        })),
      },
      activeJobs: activeJobs.slice(0, 10).map((job) => ({
        id: job.id,
        text: job.data.text.substring(0, 50),
        targetLanguages: job.data.targetLanguages,
        startedAt: job.processedOn,
        elapsedMs: job.processedOn ? now - job.processedOn : 0,
      })),
      waitingJobs: waitingJobs.slice(0, 10).map((job) => ({
        id: job.id,
        text: job.data.text.substring(0, 50),
        targetLanguages: job.data.targetLanguages,
        waitingMs: now - job.timestamp,
      })),
      recentCompleted: completedJobs.slice(0, 5).map((job) => ({
        id: job.id,
        text: job.data.text.substring(0, 50),
        processingTimeMs:
          job.finishedOn && job.processedOn
            ? job.finishedOn - job.processedOn
            : 0,
      })),
      recentFailed: failedJobs.slice(0, 5).map((job) => ({
        id: job.id,
        text: job.data.text.substring(0, 50),
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
}

export const queueService = new QueueService();
