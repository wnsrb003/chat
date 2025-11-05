"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueService = void 0;
const bull_1 = __importDefault(require("bull"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const ioredis_1 = __importDefault(require("ioredis"));
class QueueService {
    queue;
    constructor() {
        this.queue = new bull_1.default(config_1.config.queue.name, {
            redis: {
                host: config_1.config.redis.host,
                port: config_1.config.redis.port,
                password: config_1.config.redis.password,
            },
            defaultJobOptions: {
                removeOnComplete: 100, // Keep last 100 completed jobs
                removeOnFail: 1000, // Keep last 1000 failed jobs
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
                timeout: config_1.config.queue.timeout,
            },
        });
        this.setupEventHandlers();
        this.subscribeToWorker();
    }
    setupEventHandlers() {
        this.queue.on("error", (error) => {
            logger_1.logger.error({ error }, "Queue error");
        });
        this.queue.on("failed", (job, error) => {
            logger_1.logger.error({ jobId: job.id, error }, "Job failed");
        });
        this.queue.on("completed", (job) => {
            logger_1.logger.info({ jobId: job.id }, "Job completed");
        });
        this.queue.on("stalled", (job) => {
            logger_1.logger.warn({ jobId: job.id }, "Job stalled");
        });
    }
    subscribeToWorker() {
        const redisSub = new ioredis_1.default({
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
        });
        const CHANNEL = "bull:translation-results:completed:jobId";
        // 구독
        redisSub.subscribe(CHANNEL, async (err, count) => {
            if (err) {
                console.error("Failed to subscribe: ", err);
                return;
            }
            logger_1.logger.info(`Subscribed to ${CHANNEL} (${count} channels)`);
        });
        redisSub.on("message", async (channel, message) => {
            logger_1.logger.info(`Received message on channel ${channel}: ${message}`);
            if (channel !== CHANNEL)
                return;
            try {
                const { jobId, result } = JSON.parse(message);
                const job = await exports.queueService.getJob(jobId);
                if (!job) {
                    console.warn(`Job ${jobId} not found`);
                    return;
                }
                await exports.queueService.completeJob(jobId, result, "");
                console.log(`✅ Job ${jobId} marked as completed via Python message`);
            }
            catch (err) {
                console.error("Error processing Python completion message:", err);
            }
        });
    }
    async addJob(data, options) {
        const job = await this.queue.add(data, {
            jobId: data.id,
            ...options,
        });
        logger_1.logger.debug({ jobId: job.id, text: data.text }, "Job added to queue");
        return job;
    }
    async getJob(jobId) {
        return this.queue.getJob(jobId);
    }
    async waitForResult(jobId, timeout = config_1.config.queue.timeout) {
        const job = await this.getJob(jobId);
        logger_1.logger.info({ jobId, job }, "Waiting for result");
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }
        return Promise.race([
            job.finished(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Job timeout")), timeout)),
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
    async completeJob(jobId, result, error) {
        try {
            const job = await this.getJob(jobId);
            if (error) {
                await job?.moveToFailed({ message: error }, true);
                console.log(`💥 Job ${jobId} failed: ${error}`);
            }
            else {
                await job?.moveToCompleted(JSON.stringify(result));
                // console.log(`✅ Job ${jobId} completed`);
            }
        }
        catch (error) {
            logger_1.logger.error({ error }, "Failed to complete job");
            // throw error;
        }
    }
    async close() {
        await this.queue.close();
        logger_1.logger.info("Queue closed");
    }
}
exports.queueService = new QueueService();
//# sourceMappingURL=queue.service.js.map