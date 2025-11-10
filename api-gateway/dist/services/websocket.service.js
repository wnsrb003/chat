"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const zod_1 = require("zod");
const queue_service_1 = require("./queue.service");
const cache_grpc_service_1 = require("./cache-grpc.service");
const xlsx_logger_service_1 = require("./xlsx-logger.service");
const logger_1 = require("../utils/logger");
const crypto_1 = require("crypto");
const wsMessageSchema = zod_1.z.object({
    type: zod_1.z.enum(["translate", "ping"]),
    text: zod_1.z.string().min(1).max(5000).optional(),
    targetLanguages: zod_1.z.array(zod_1.z.string()).min(1).max(10).optional(),
    options: zod_1.z
        .object({
        expandAbbreviations: zod_1.z.boolean().optional().default(true),
        filterProfanity: zod_1.z.boolean().optional().default(false),
        normalizeRepeats: zod_1.z.boolean().optional().default(true),
        removeEmoticons: zod_1.z.boolean().optional().default(true),
        fixTypos: zod_1.z.boolean().optional().default(false),
    })
        .optional(),
});
class WebSocketService {
    wss;
    clients = new Map();
    constructor(server) {
        this.wss = new ws_1.WebSocketServer({
            server,
            path: "/ws",
        });
        this.setupWebSocketServer();
    }
    setupWebSocketServer() {
        this.wss.on("connection", (ws) => {
            const clientId = (0, crypto_1.randomUUID)();
            this.clients.set(clientId, ws);
            logger_1.logger.info({ clientId }, "WebSocket client connected");
            ws.send(JSON.stringify({
                type: "connected",
                clientId,
                message: "Connected to translation service",
            }));
            ws.on("message", async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    // logger.info({ message, clientId }, "WebSocket message received");
                    await this.handleMessage(ws, clientId, message);
                }
                catch (error) {
                    logger_1.logger.error({ error, clientId }, "WebSocket message error");
                    ws.send(JSON.stringify({
                        type: "error",
                        error: "Invalid message format",
                    }));
                }
            });
            ws.on("close", () => {
                this.clients.delete(clientId);
                logger_1.logger.info({ clientId }, "WebSocket client disconnected");
            });
            ws.on("error", (error) => {
                logger_1.logger.error({ error, clientId }, "WebSocket error");
            });
            // Heartbeat
            const interval = setInterval(() => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.ping();
                }
                else {
                    clearInterval(interval);
                }
            }, 30000);
        });
    }
    async handleMessage(ws, clientId, message) {
        try {
            const validatedMessage = wsMessageSchema.parse(message);
            if (validatedMessage.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }
            if (validatedMessage.type === "translate") {
                if (!validatedMessage.text || !validatedMessage.targetLanguages) {
                    ws.send(JSON.stringify({
                        type: "error",
                        error: "Missing required fields: text and targetLanguages",
                    }));
                    return;
                }
                logger_1.logger.info({
                    text: validatedMessage.text.substring(0, 50),
                    languageCount: validatedMessage.targetLanguages.length,
                    clientId,
                }, "WebSocket translate request received");
                // 각 언어를 완전히 독립적으로 처리 (fire-and-forget)
                validatedMessage.targetLanguages.forEach((targetLang) => {
                    this.processLanguageIndependentlyForWebSocket(ws, validatedMessage.text, targetLang, validatedMessage.options || {}).catch((error) => {
                        logger_1.logger.error({ error, targetLang, clientId }, "WebSocket translation error");
                    });
                });
            }
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                ws.send(JSON.stringify({
                    type: "error",
                    error: "Validation error",
                    details: error.errors,
                }));
            }
            else {
                logger_1.logger.error({ error, clientId }, "Message handling error");
                ws.send(JSON.stringify({
                    type: "error",
                    error: "Internal server error",
                }));
            }
        }
    }
    /**
     * 각 언어를 완전히 독립적으로 처리 (전처리 + 번역)
     */
    async processLanguageIndependentlyForWebSocket(ws, text, targetLang, options) {
        const jobId = (0, crypto_1.randomUUID)();
        const startTime = performance.now();
        try {
            // Step 1: 전처리 (각 언어마다 독립적으로)
            await queue_service_1.queueService.addJob({
                id: jobId,
                text: text,
                targetLanguages: [targetLang],
                options: options,
                createdAt: Date.now(),
            });
            logger_1.logger.debug({ jobId, targetLang }, "Independent WebSocket job started");
            // Step 2: 전처리 결과 대기
            const preprocessingResult = await queue_service_1.queueService.waitForPreprocessing(jobId);
            if (preprocessingResult.filtered) {
                logger_1.logger.warn({ jobId, targetLang }, "Text filtered in preprocessing");
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "partial-error",
                        jobId,
                        data: {
                            language: targetLang,
                            error: "Text filtered",
                            reason: preprocessingResult.filter_reason,
                        },
                    }));
                }
                return;
            }
            // Step 3: 전처리 완료 전송
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "preprocessing-complete",
                    jobId,
                    data: {
                        language: targetLang,
                        originalText: preprocessingResult.original_text,
                        preprocessedText: preprocessingResult.preprocessed_text,
                        detectedLanguage: preprocessingResult.detected_language,
                        preprocessing_ms: preprocessingResult.preprocessing_time_ms,
                    },
                }));
            }
            // Step 4: 번역 (단일 언어)
            const translationStartTime = performance.now();
            const grpcResult = await cache_grpc_service_1.cacheGrpcService.translate({
                text: preprocessingResult.preprocessed_text,
                source_lang: preprocessingResult.detected_language,
                target_langs: [targetLang],
                use_cache: true,
                cache_strategy: "hybrid",
                translator_name: "vllm",
            });
            const translationDuration = performance.now() - translationStartTime;
            const totalDuration = performance.now() - startTime;
            // Step 5: 번역 완료 전송
            if (grpcResult.translations[targetLang]) {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "partial-translation",
                        jobId,
                        data: {
                            language: targetLang,
                            translation: grpcResult.translations[targetLang],
                            cacheHit: grpcResult.cache_hits[targetLang] || false,
                            translation_ms: translationDuration,
                            total_ms: totalDuration,
                        },
                    }));
                }
                // CSV 로깅
                xlsx_logger_service_1.xlsxLoggerService.logTranslation({
                    timestamp: new Date().toISOString(),
                    originalText: preprocessingResult.original_text,
                    preprocessedText: preprocessingResult.preprocessed_text,
                    detectedLanguage: preprocessingResult.detected_language,
                    translations: {
                        [targetLang]: grpcResult.translations[targetLang],
                    },
                    timings: {
                        preprocessingMs: preprocessingResult.preprocessing_time_ms,
                        translationMs: translationDuration,
                        totalMs: totalDuration,
                    },
                    cacheHits: grpcResult.cache_hits[targetLang] || false,
                    cacheProcessingMs: grpcResult.processing_time_ms,
                    filtered: false,
                });
                logger_1.logger.info({
                    jobId,
                    targetLang,
                    duration: totalDuration,
                }, "Independent WebSocket translation completed");
            }
        }
        catch (error) {
            logger_1.logger.error({ error, jobId, targetLang }, "Independent WebSocket translation failed");
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "partial-error",
                    jobId,
                    data: {
                        language: targetLang,
                        error: "Translation failed",
                        message: error instanceof Error ? error.message : "Unknown error",
                    },
                }));
            }
        }
    }
    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
    close() {
        this.clients.forEach((client) => client.close());
        this.wss.close();
        logger_1.logger.info("WebSocket server closed");
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocket.service.js.map