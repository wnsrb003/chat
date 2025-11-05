"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const queue_service_1 = require("../services/queue.service");
const spellcheck_service_1 = require("../services/spellcheck.service");
const logger_1 = require("../utils/logger");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
// Validation schema
const translateSchema = zod_1.z.object({
    text: zod_1.z.string().min(1).max(5000),
    targetLanguages: zod_1.z.array(zod_1.z.string()).min(1).max(10),
    options: zod_1.z
        .object({
        expandAbbreviations: zod_1.z.boolean().optional().default(true),
        filterProfanity: zod_1.z.boolean().optional().default(false),
        normalizeRepeats: zod_1.z.boolean().optional().default(true),
        removeEmoticons: zod_1.z.boolean().optional().default(true),
        fixTypos: zod_1.z.boolean().optional().default(false),
    })
        .optional(),
    async: zod_1.z.boolean().optional().default(false),
});
/**
 * @swagger
 * /api/v1/translate:
 *   post:
 *     summary: Translate text to multiple languages
 *     description: Translates Korean chat text to multiple target languages with preprocessing
 *     tags: [Translation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TranslateRequest'
 *           examples:
 *             basic:
 *               summary: Basic translation
 *               value:
 *                 text: "안녕하세요"
 *                 targetLanguages: ["en", "ja"]
 *             withOptions:
 *               summary: Translation with preprocessing options
 *               value:
 *                 text: "ㅋㅋㅋㅋㅋ 오늘 날씨 너무 좋음ㅋㅋ"
 *                 targetLanguages: ["en", "ja", "zh"]
 *                 options:
 *                   expandAbbreviations: true
 *                   normalizeRepeats: true
 *                   removeEmoticons: true
 *             async:
 *               summary: Async translation (get job ID)
 *               value:
 *                 text: "긴 텍스트를 번역할 때 유용합니다"
 *                 targetLanguages: ["en"]
 *                 async: true
 *     responses:
 *       200:
 *         description: Translation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TranslateResponse'
 *       202:
 *         description: Translation job queued (async mode)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AsyncResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       408:
 *         description: Translation timeout
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/translate", async (req, res) => {
    try {
        const validatedData = translateSchema.parse(req.body);
        const jobId = (0, crypto_1.randomUUID)();
        const job = await queue_service_1.queueService.addJob({
            id: jobId,
            text: validatedData.text,
            targetLanguages: validatedData.targetLanguages,
            options: validatedData.options,
            createdAt: Date.now(),
        });
        // Async mode: return job ID immediately
        if (validatedData.async) {
            return res.status(202).json({
                success: true,
                jobId: job.id,
                message: "Translation job queued",
            });
        }
        // Sync mode: wait for result
        try {
            const result = await queue_service_1.queueService.waitForResult(jobId);
            console.log(result, "!!!");
            return res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            logger_1.logger.error({ error, jobId }, "Translation job timeout or failed");
            return res.status(408).json({
                success: false,
                error: "Translation timeout",
                jobId,
                message: "You can check the result later using /api/v1/jobs/:jobId",
            });
        }
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                error: "Validation error",
                details: error.errors,
            });
        }
        logger_1.logger.error({ error }, "Translation request failed");
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
});
/**
 * @swagger
 * /api/v1/jobs/{jobId}:
 *   get:
 *     summary: Get translation job status
 *     description: Retrieve the status and result of a translation job
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID returned from async translation request
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobStatusResponse'
 *             examples:
 *               completed:
 *                 summary: Job completed
 *                 value:
 *                   success: true
 *                   status: "completed"
 *                   data:
 *                     jobId: "123e4567-e89b-12d3-a456-426614174000"
 *                     original: "안녕하세요"
 *                     preprocessed: "안녕하세요"
 *                     translations:
 *                       en: "Hello"
 *                       ja: "こんにちは"
 *               processing:
 *                 summary: Job in progress
 *                 value:
 *                   success: true
 *                   status: "active"
 *                   progress: 50
 *               failed:
 *                 summary: Job failed
 *                 value:
 *                   success: false
 *                   status: "failed"
 *                   error: "Translation service unavailable"
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/jobs/:jobId", async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await queue_service_1.queueService.getJob(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                error: "Job not found",
            });
        }
        const state = await job.getState();
        const progress = job.progress();
        if (state === "completed") {
            const result = job.returnvalue;
            return res.json({
                success: true,
                status: "completed",
                data: result,
            });
        }
        if (state === "failed") {
            return res.json({
                success: false,
                status: "failed",
                error: job.failedReason,
            });
        }
        return res.json({
            success: true,
            status: state,
            progress,
        });
    }
    catch (error) {
        logger_1.logger.error({ error }, "Failed to get job status");
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
});
// POST /api/v1/spellcheck
const spellCheckSchema = zod_1.z.object({
    text: zod_1.z.string().min(1).max(5000),
});
/**
 * @swagger
 * /api/v1/spellcheck:
 *   post:
 *     summary: Check Korean spelling
 *     description: Check Korean text for spelling errors using nspell with Korean dictionary
 *     tags: [Spell Check]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SpellCheckRequest'
 *           examples:
 *             correct:
 *               summary: Correct spelling
 *               value:
 *                 text: "안녕하세요"
 *             withErrors:
 *               summary: Text with potential errors
 *               value:
 *                 text: "안녕하세요 반갑습니다"
 *     responses:
 *       200:
 *         description: Spell check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SpellCheckResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Spell checker is initializing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/spellcheck", async (req, res) => {
    try {
        const validatedData = spellCheckSchema.parse(req.body);
        if (!spellcheck_service_1.spellCheckService.isReady()) {
            return res.status(503).json({
                success: false,
                error: "Spell checker is initializing. Please try again in a few seconds.",
            });
        }
        const startTime = Date.now();
        const result = spellcheck_service_1.spellCheckService.check(validatedData.text);
        const duration = Date.now() - startTime;
        logger_1.logger.info({ text: validatedData.text, hasErrors: result.hasErrors, duration }, "Spell check completed successfully");
        return res.json({
            success: true,
            data: result,
            meta: {
                duration,
            },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                error: "Validation error",
                details: error.errors,
            });
        }
        logger_1.logger.error({ error }, "Spell check request failed");
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
});
/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Health check
 *     description: Check the health status of the API Gateway and its services
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               success: true
 *               status: "healthy"
 *               queue:
 *                 waiting: 5
 *                 active: 2
 *                 completed: 1523
 *                 failed: 12
 *               spellChecker: "ready"
 *               timestamp: 1699999999999
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/health", async (req, res) => {
    try {
        const stats = await queue_service_1.queueService.getQueueStats();
        return res.json({
            success: true,
            status: "healthy",
            queue: stats,
            spellChecker: spellcheck_service_1.spellCheckService.isReady() ? "ready" : "initializing",
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.logger.error({ error }, "Health check failed");
        return res.status(503).json({
            success: false,
            status: "unhealthy",
        });
    }
});
exports.default = router;
//# sourceMappingURL=translate.routes.js.map