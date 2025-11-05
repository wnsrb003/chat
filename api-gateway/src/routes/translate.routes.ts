import { Router, Request, Response } from "express";
import { z } from "zod";
import { queueService } from "../services/queue.service";
import { spellCheckService } from "../services/spellcheck.service";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";

const router = Router();

// WebSocket service import (will be set by index.ts)
let wsService: any = null;
export const setWebSocketService = (ws: any) => {
  wsService = ws;
};

// Validation schema
const translateSchema = z.object({
  text: z.string().min(1).max(5000),
  targetLanguages: z.array(z.string()).min(1).max(10),
  options: z
    .object({
      expandAbbreviations: z.boolean().optional().default(true),
      filterProfanity: z.boolean().optional().default(false),
      normalizeRepeats: z.boolean().optional().default(true),
      removeEmoticons: z.boolean().optional().default(true),
      fixTypos: z.boolean().optional().default(false),
    })
    .optional(),
  async: z.boolean().optional().default(false),
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
router.post("/translate", async (req: Request, res: Response) => {
  try {
    const validatedData = translateSchema.parse(req.body);
    const jobId = randomUUID();

    const time = performance.now();
    const job = await queueService.addJob({
      id: jobId,
      text: validatedData.text,
      targetLanguages: validatedData.targetLanguages,
      options: validatedData.options,
      createdAt: Date.now(),
    });
    console.log("addJob api", performance.now() - time);

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
      const result = await queueService.waitForResult(jobId);
      console.log("waitForResult api", performance.now() - time, typeof result);
      return res.json({
        success: true,
        data: JSON.parse(result as string),
      });
    } catch (error) {
      logger.error({ error, jobId }, "Translation job timeout or failed");
      return res.status(408).json({
        success: false,
        error: "Translation timeout",
        jobId,
        message: "You can check the result later using /api/v1/jobs/:jobId",
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    }

    logger.error({ error }, "Translation request failed");
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
router.get("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await queueService.getJob(jobId);

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
  } catch (error) {
    logger.error({ error }, "Failed to get job status");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// POST /api/v1/spellcheck
const spellCheckSchema = z.object({
  text: z.string().min(1).max(5000),
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
router.post("/spellcheck", async (req: Request, res: Response) => {
  try {
    const validatedData = spellCheckSchema.parse(req.body);

    if (!spellCheckService.isReady()) {
      return res.status(503).json({
        success: false,
        error:
          "Spell checker is initializing. Please try again in a few seconds.",
      });
    }

    const startTime = Date.now();
    const result = spellCheckService.check(validatedData.text);
    const duration = Date.now() - startTime;

    logger.info(
      { text: validatedData.text, hasErrors: result.hasErrors, duration },
      "Spell check completed successfully"
    );

    return res.json({
      success: true,
      data: result,
      meta: {
        duration,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    }

    logger.error({ error }, "Spell check request failed");
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
router.get("/health", async (req: Request, res: Response) => {
  try {
    const stats = await queueService.getQueueStats();
    return res.json({
      success: true,
      status: "healthy",
      queue: stats,
      spellChecker: spellCheckService.isReady() ? "ready" : "initializing",
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, "Health check failed");
    return res.status(503).json({
      success: false,
      status: "unhealthy",
    });
  }
});

/**
 * @swagger
 * /api/v1/broadcast-ws:
 *   post:
 *     summary: Broadcast raw message to WebSocket clients (no translation)
 *     description: Send raw message to all WebSocket clients immediately
 *     tags: [Broadcast]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - data
 *             properties:
 *               type:
 *                 type: string
 *                 example: "chat_original"
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Message broadcasted successfully
 */
router.post("/broadcast-ws", async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: type and data",
      });
    }

    // Broadcast to all WebSocket clients
    if (wsService) {
      wsService.broadcast({
        type,
        data,
      });

      // logger.info({ type, data }, "Message broadcasted to WebSocket clients");
    }

    return res.json({
      success: true,
      broadcasted: !!wsService,
    });
  } catch (error) {
    logger.error({ error }, "Broadcast-WS request failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * @swagger
 * /api/v1/broadcast:
 *   post:
 *     summary: Broadcast translation to all WebSocket clients
 *     description: Translate text and broadcast the result to all connected WebSocket clients (for real-time crawlers)
 *     tags: [Broadcast]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - targetLanguages
 *             properties:
 *               text:
 *                 type: string
 *                 description: Text to translate
 *                 example: "안녕하세요"
 *               targetLanguages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Target languages
 *                 example: ["en", "th"]
 *               options:
 *                 type: object
 *                 description: Translation options
 *               metadata:
 *                 type: object
 *                 description: Additional metadata (e.g., username, timestamp)
 *                 example:
 *                   username: "유저1"
 *                   platform: "afreecatv"
 *     responses:
 *       200:
 *         description: Translation broadcasted successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post("/broadcast", async (req: Request, res: Response) => {
  try {
    const validatedData = translateSchema.parse(req.body);
    const metadata = req.body.metadata || {};
    const jobId = randomUUID();

    await queueService.addJob({
      id: jobId,
      text: validatedData.text,
      targetLanguages: validatedData.targetLanguages,
      options: validatedData.options,
      createdAt: Date.now(),
    });

    // Wait for translation result
    try {
      const result = await queueService.waitForResult(jobId);

      // Broadcast to all WebSocket clients
      if (wsService) {
        wsService.broadcast({
          type: "broadcast",
          data: {
            ...JSON.parse(result as string),
            metadata,
          },
        });

        // logger.info(
        //   { jobId, metadata },
        //   "Translation broadcasted to WebSocket clients"
        // );
      }

      return res.json({
        success: true,
        data: result,
        broadcasted: !!wsService,
      });
    } catch (error) {
      console.log(error, "@@");
      logger.error({ error, jobId }, "Broadcast translation failed");
      return res.status(408).json({
        success: false,
        error: "Translation timeout",
        jobId,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    }

    logger.error({ error }, "Broadcast request failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * @swagger
 * /api/v1/queue/stats:
 *   get:
 *     summary: Get detailed queue statistics
 *     description: Get detailed Bull queue statistics including job counts, performance metrics, and recent jobs
 *     tags: [Queue]
 *     responses:
 *       200:
 *         description: Queue statistics retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get("/queue/stats", async (req: Request, res: Response) => {
  try {
    const stats = await queueService.getDetailedStats();
    return res.json({
      success: true,
      data: stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, "Failed to get queue stats");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
