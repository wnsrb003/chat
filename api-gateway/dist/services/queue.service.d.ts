import { Job, JobOptions } from "bull";
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
declare class QueueService {
    private queue;
    constructor();
    private setupEventHandlers;
    private subscribeToWorker;
    addJob(data: TranslationJob, options?: JobOptions): Promise<Job<TranslationJob>>;
    getJob(jobId: string): Promise<Job<TranslationJob> | null>;
    waitForResult(jobId: string, timeout?: number): Promise<TranslationResult>;
    getQueueStats(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        total: number;
    }>;
    completeJob(jobId: string, result: TranslationResult, error: string): Promise<void>;
    close(): Promise<void>;
}
export declare const queueService: QueueService;
export {};
//# sourceMappingURL=queue.service.d.ts.map