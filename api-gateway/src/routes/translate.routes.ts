import { Router, Request, Response } from "express";
import { z } from "zod";
import { queueService } from "../services/queue.service";
import { cacheService } from "../services/cache.service";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";
import { getHttpRps } from "../index";

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

    const startTime = performance.now();

    // Step 1: Add preprocessing job
    const job = await queueService.addJob({
      id: jobId,
      text: validatedData.text,
      targetLanguages: validatedData.targetLanguages,
      options: validatedData.options,
      createdAt: Date.now(),
    });

    // logger.debug({ // CPU 최적화
    //   msg: "Preprocessing job added",
    //   jobId,
    //   duration: performance.now() - startTime,
    // });

    // Async mode: return job ID immediately (전처리 + 번역 모두 비동기)
    if (validatedData.async) {
      return res.status(202).json({
        success: true,
        jobId: job.id,
        message: "Translation job queued",
      });
    }

    // Sync mode: wait for preprocessing, then call gRPC
    try {
      // Step 2: Wait for preprocessing result from Python worker
      const preprocessingResult = await queueService.waitForPreprocessing(
        jobId
      );

      // Step 3: Check if filtered
      if (preprocessingResult.filtered) {
        const translations = {
          en: preprocessingResult.original_text,
          th: preprocessingResult.original_text,
          "zh-CN": preprocessingResult.original_text,
          "zh-TW": preprocessingResult.original_text,
        };
        return res.json({
          success: true,
          data: {
            id: jobId,
            originalText: preprocessingResult.original_text,
            preprocessedText: preprocessingResult.preprocessed_text,
            translations,
            detectedLanguage: preprocessingResult.detected_language,
            cacheHits: false,
            preprocessing_ms: preprocessingResult.preprocessing_time_ms,
            translation_ms: -1,
            total_ms: performance.now() - startTime,
            filtered: preprocessingResult.filtered,
            filterReason: preprocessingResult.filter_reason,
          },
        });
      }

      // Step 4: Call gRPC for each language in parallel
      const allTranslations: Record<string, object> = {};
      let maxTranslationTime = 0;

      // 각 언어별로 병렬 처리
      const translationPromises = validatedData.targetLanguages.map(
        async (targetLang) => {
          try {
            const grpcResult = await cacheService.translate({
              text: preprocessingResult.preprocessed_text,
              source_lang: preprocessingResult.detected_language,
              target_langs: [targetLang], // 각 언어별로 개별 요청
              use_cache: false,
              cache_strategy: "hybrid",
              translator_name: "vllm",
            });

            const langDuration = performance.now() - startTime;
            maxTranslationTime = Math.max(maxTranslationTime, langDuration);

            if (grpcResult.translations[targetLang]) {
              allTranslations[targetLang] = {
                id: jobId,
                language: targetLang,
                translation: grpcResult.translations[targetLang],
                cache_hit: grpcResult.cache_hits[targetLang] || false,
                originalText: preprocessingResult.original_text,
                preprocessedText: preprocessingResult.preprocessed_text,
                detectedLanguage: preprocessingResult.detected_language,
                total_ms: langDuration,
                preprocessing_ms: preprocessingResult.preprocessing_time_ms,
                cache_processing_ms: grpcResult.processing_time_ms,
                cache_lookup_time_ms: grpcResult.cache_lookup_time_ms || -1,
                llm_response_time_ms: grpcResult.llm_response_time_ms || -1,
                filtered: preprocessingResult.filtered,
                filter_reason: preprocessingResult.filter_reason,
              };

              // allTranslations[targetLang].originalText =
              //   preprocessingResult.original_text;
              // allTranslations[targetLang] = grpcResult.translations[targetLang];
              // allCacheHits[targetLang] =
              //   grpcResult.cache_hits[targetLang] || false;
              // cacheTimings[targetLang] = grpcResult.cache_lookup_time_ms || -1;
              // llmTimings[targetLang] = grpcResult.llm_response_time_ms || -1;
              // cacheTotalTimings[targetLang] =
              //   grpcResult.processing_time_ms || -1;
            }
          } catch (error) {
            logger.error(
              { error, targetLang },
              `Translation failed for ${targetLang}`
            );
            // 실패한 언어는 빈 문자열로 처리
            allTranslations[targetLang] = {};
          }
        }
      );

      // 모든 언어 번역 완료 대기
      await Promise.all(translationPromises);

      // logger.info({ // CPU 최적화
      //   msg: "Translation completed (parallel)",
      //   jobId,
      //   preprocessingTime: preprocessingResult.preprocessing_time_ms,
      //   maxTranslationTime: maxTranslationTime,
      //   totalTime: totalDuration,
      //   languageCount: validatedData.targetLanguages.length,
      // });

      // Step 5: Return result
      return res.json({
        success: true,
        // data: {
        //   id: jobId,
        //   originalText: preprocessingResult.original_text,
        //   preprocessedText: preprocessingResult.preprocessed_text,
        //   translations: allTranslations,
        //   detectedLanguage: preprocessingResult.detected_language,
        //   cacheHits: allCacheHits,
        //   timings: {
        //     preprocessing_ms: preprocessingResult.preprocessing_time_ms,
        //     total_ms: totalDuration,
        //   },
        //   cacheTimings: { cacheTotalTimings, cacheTimings, llmTimings },
        //   filtered: false,
        //   filter_reason: "",
        // },
        data: allTranslations,
      });
    } catch (error) {
      logger.error({ error, jobId }, "Translation job failed");
      return res.status(408).json({
        success: false,
        error: "Translation failed",
        jobId,
        message: error instanceof Error ? error.message : "Unknown error",
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
// const spellCheckSchema = z.object({
//   text: z.string().min(1).max(5000),
// });

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
// router.post("/spellcheck", async (req: Request, res: Response) => {
//   try {
//     const validatedData = spellCheckSchema.parse(req.body);

//     if (!spellCheckService.isReady()) {
//       return res.status(503).json({
//         success: false,
//         error:
//           "Spell checker is initializing. Please try again in a few seconds.",
//       });
//     }

//     const startTime = Date.now();
//     const result = spellCheckService.check(validatedData.text);
//     const duration = Date.now() - startTime;

//     logger.info(
//       { text: validatedData.text, hasErrors: result.hasErrors, duration },
//       "Spell check completed successfully"
//     );

//     return res.json({
//       success: true,
//       data: result,
//       meta: {
//         duration,
//       },
//     });
//   } catch (error) {
//     if (error instanceof z.ZodError) {
//       return res.status(400).json({
//         success: false,
//         error: "Validation error",
//         details: error.errors,
//       });
//     }

//     logger.error({ error }, "Spell check request failed");
//     return res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

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
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const stats = await queueService.getQueueStats();
    return res.json({
      success: true,
      status: "healthy",
      queue: stats,
      // spellChecker: spellCheckService.isReady() ? "ready" : "initializing",
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
/**
 * 각 언어를 완전히 독립적으로 처리 (전처리 + 번역)
 */
async function processLanguageIndependently(
  text: string,
  targetLang: string,
  options: any,
  metadata: any
) {
  const jobId = randomUUID();
  const startTime = performance.now();

  try {
    // Step 1: 전처리 (각 언어마다 독립적으로)
    await queueService.addJob({
      id: jobId,
      text: text,
      targetLanguages: [targetLang],
      options: options,
      createdAt: Date.now(),
    });

    // logger.debug({ jobId, targetLang }, "Independent job started"); // CPU 최적화

    // Step 2: 전처리 결과 대기
    const preprocessingResult = await queueService.waitForPreprocessing(jobId);

    const gateway_preprocessing_time_ms = performance.now() - startTime;
    // const preprocessingResult = {
    //   preprocessed_text: text,
    //   detected_language: "ko",
    //   original_text: text,
    //   preprocessing_time_ms: 0,
    //   filtered: false,
    //   filter_reason: "",
    // };

    if (preprocessingResult.filtered) {
      // logger.warn({ jobId, targetLang }, "Text filtered in preprocessing");
      // 필터링 메시지 브로드캐스트 (CPU 최적화: 주석 처리 가능)
      if (wsService) {
        wsService.broadcast({
          type: "partial-translation",
          jobId,
          data: {
            language: targetLang,
            translation: preprocessingResult.original_text,
            cacheHit: false,
            total_ms: performance.now() - startTime,
            // XLSX 로깅용 추가 정보
            originalText: preprocessingResult.original_text,
            preprocessedText: preprocessingResult.preprocessed_text,
            detectedLanguage: preprocessingResult.detected_language,
            gateway_preprocessing_time_ms: gateway_preprocessing_time_ms,
            preprocessing_ms: preprocessingResult.preprocessing_time_ms,
            cache_processing_ms: -1,
            cache_lookup_time_ms: -1,
            llm_response_time_ms: -1,
            metadata,
            filtered: true,
            filter_reason: preprocessingResult.filter_reason,
          },
        });
      }
      return;
    }

    // Step 3: 전처리 완료 브로드캐스트 (CPU 사용 주의: 4개 언어 = 4번 broadcast)
    // 성능 최적화: 전처리 메시지 생략 가능 (번역 완료 메시지만으로 충분)
    // if (wsService) {
    //   wsService.broadcast({
    //     type: "preprocessing-complete",
    //     jobId,
    //     data: {
    //       language: targetLang,
    //       originalText: preprocessingResult.original_text,
    //       preprocessedText: preprocessingResult.preprocessed_text,
    //       detectedLanguage: preprocessingResult.detected_language,
    //       preprocessing_ms: preprocessingResult.preprocessing_time_ms,
    //       metadata,
    //     },
    //   });
    // }

    // Step 4: 번역 (단일 언어)
    const grpcResult = await cacheService.translate({
      text: preprocessingResult.preprocessed_text,
      source_lang: preprocessingResult.detected_language,
      target_langs: [targetLang],
      use_cache: false,
      cache_strategy: "hybrid",
      translator_name: "vllm",
    });

    const totalDuration = performance.now() - startTime;

    // Step 5: 번역 완료 브로드캐스트
    if (grpcResult.translations[targetLang]) {
      if (wsService) {
        wsService.broadcast({
          type: "partial-translation",
          jobId,
          data: {
            language: targetLang,
            translation: grpcResult.translations[targetLang],
            cacheHit: grpcResult.cache_hits[targetLang] || false,
            total_ms: totalDuration,
            // XLSX 로깅용 추가 정보
            originalText: preprocessingResult.original_text,
            preprocessedText: preprocessingResult.preprocessed_text,
            detectedLanguage: preprocessingResult.detected_language,
            gateway_preprocessing_time_ms: gateway_preprocessing_time_ms,
            preprocessing_ms: preprocessingResult.preprocessing_time_ms,
            cache_processing_ms: grpcResult.processing_time_ms,
            cache_lookup_time_ms: grpcResult.cache_lookup_time_ms,
            llm_response_time_ms: grpcResult.llm_response_time_ms,
            metadata,
          },
        });
      }
    }
  } catch (error) {
    logger.error(
      { error, jobId, targetLang },
      "Independent translation failed"
    );

    if (wsService) {
      wsService.broadcast({
        type: "partial-error",
        jobId,
        data: {
          language: targetLang,
          error: "Translation failed",
          message: error instanceof Error ? error.message : "Unknown error",
          metadata,
        },
      });
    }
  }
}

router.post("/broadcast", async (req: Request, res: Response) => {
  try {
    const validatedData = translateSchema.parse(req.body);
    const metadata = req.body.metadata || {};

    // logger.info( // CPU 최적화: 로그 생략
    //   {
    //     text: validatedData.text.substring(0, 50),
    //     languageCount: validatedData.targetLanguages.length,
    //   },
    //   "Broadcast request received"
    // );

    // 각 언어를 완전히 독립적으로 처리 (fire-and-forget)
    validatedData.targetLanguages.forEach((targetLang) => {
      processLanguageIndependently(
        validatedData.text,
        targetLang,
        validatedData.options,
        metadata
      ).catch((error) => {
        logger.error({ error, targetLang }, "Background processing error");
      });
    });

    // 즉시 202 Accepted 응답 반환
    return res.status(202).json({
      success: true,
      message: "Translation jobs started",
      languageCount: validatedData.targetLanguages.length,
      languages: validatedData.targetLanguages,
    });
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
router.get("/queue/stats", async (_req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/v1/rps/stats:
 *   get:
 *     summary: Get real-time RPS statistics
 *     description: Get real-time requests per second statistics from all services
 *     tags: [RPS]
 *     responses:
 *       200:
 *         description: RPS statistics retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get("/rps/stats", (_req: Request, res: Response) => {
  try {
    const queueMetrics = queueService.getRpsMetrics();
    const wsMetrics = wsService
      ? wsService.getRpsMetrics()
      : {
          connections: 0,
          translateRequest: 0,
          translationComplete: 0,
        };
    const cacheGrpcMetrics = cacheService.getRpsMetrics();

    const data = {
      apiGateway: getHttpRps(),
      queue: queueMetrics,
      websocket: wsMetrics,
      cacheGrpc: cacheGrpcMetrics,
      worker: {
        // Python worker metrics will be added via separate endpoint or WebSocket
        processing: 0,
        complete: 0,
      },
    };

    return res.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, "Failed to get RPS stats");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
