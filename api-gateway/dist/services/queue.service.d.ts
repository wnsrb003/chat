import Queue, { Job, JobOptions } from "bull";
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
export interface PreprocessingResult {
    original_text: string;
    preprocessed_text: string;
    detected_language: string;
    preprocessing_time_ms: number;
    filtered: boolean;
    filter_reason?: string;
}
declare class QueueService {
    private queue;
    private preprocessingResults;
    private preprocessingResolvers;
    private queueAddCounter;
    private preprocessingCompleteCounter;
    private lastQueueAddRps;
    private lastPreprocessingCompleteRps;
    private redisWriteTimeSum;
    private redisWriteCount;
    private redisReadTimeSum;
    private redisReadCount;
    private lastRedisWriteAvg;
    private lastRedisReadAvg;
    constructor();
    private setupEventHandlers;
    private subscribeToWorker;
    addJob(data: TranslationJob, options?: JobOptions): Promise<Job<TranslationJob>>;
    getJob(jobId: string): Promise<Job<TranslationJob> | null>;
    /**
     * 전처리 결과 대기
     */
    waitForPreprocessing(jobId: string, timeout?: number): Promise<PreprocessingResult>;
    getQueueStats(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        total: number;
    }>;
    getDetailedStats(): Promise<{
        counts: {
            waiting: number;
            active: number;
            completed: number;
            failed: number;
            delayed: number;
            paused: number;
            total: number;
        };
        performance: {
            avgProcessingTimeMs: number;
            throughputPerMinute: number;
        };
        redis: {
            writeAvgMs: number;
            readAvgMs: number;
            lastQueryMs: number;
        };
        stuck: {
            activeCount: number;
            waitingCount: number;
            totalStuck: number;
            stuckActiveJobs: {
                id: Queue.JobId;
                text: string;
                targetLanguages: string[];
                startedAt: number | undefined;
                elapsedMs: number;
                stuckForSeconds: number;
            }[];
            stuckWaitingJobs: {
                id: Queue.JobId;
                text: string;
                targetLanguages: string[];
                createdAt: number;
                waitingMs: number;
                waitingForSeconds: number;
            }[];
        };
        activeJobs: {
            id: Queue.JobId;
            text: string;
            targetLanguages: string[];
            startedAt: number | undefined;
            elapsedMs: number;
        }[];
        waitingJobs: {
            id: Queue.JobId;
            text: string;
            targetLanguages: string[];
            waitingMs: number;
        }[];
        recentCompleted: {
            id: Queue.JobId;
            text: string;
            processingTimeMs: number;
        }[];
        recentFailed: {
            id: Queue.JobId;
            text: string;
            error: string | undefined;
        }[];
    }>;
    completeJob(jobId: string, result: TranslationResult, error: string): Promise<void>;
    failedJob(jobId: string): Promise<void>;
    close(): Promise<void>;
    getRpsMetrics(): {
        add: number;
        preprocessingComplete: number;
    };
}
export declare const queueService: QueueService;
export {};
//# sourceMappingURL=queue.service.d.ts.map