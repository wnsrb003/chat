"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const zod_1 = require("zod");
const queue_service_1 = require("./queue.service");
const cache_service_1 = require("./cache.service");
const logger_1 = require("../utils/logger");
const crypto_1 = require("crypto");
const wsMessageSchema = zod_1.z.object({
    type: zod_1.z.enum(["translate", "ping"]),
    jobId: zod_1.z.string().optional(), // 클라이언트가 제공하는 요청 추적용 ID
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
    // RPS 모니터링
    wsConnectionCounter = 0;
    wsTranslateRequestCounter = 0;
    wsTranslationCompleteCounter = 0;
    lastWsTranslateRequestRps = 0;
    lastWsTranslationCompleteRps = 0;
    constructor(server) {
        // WebSocket RPS 모니터링
        setInterval(() => {
            this.lastWsTranslateRequestRps = this.wsTranslateRequestCounter;
            this.lastWsTranslationCompleteRps = this.wsTranslationCompleteCounter;
            // logger.info({
            //   metric: "WEBSOCKET_SERVICE",
            //   connections: this.wsConnectionCounter,
            //   translate_request_rps: this.wsTranslateRequestCounter,
            //   translation_complete_rps: this.wsTranslationCompleteCounter,
            // });
            this.wsTranslateRequestCounter = 0;
            this.wsTranslationCompleteCounter = 0;
        }, 1000);
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
            this.wsConnectionCounter++;
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
                this.wsConnectionCounter--;
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
                this.wsTranslateRequestCounter++; // RPS 카운터
                // TypeScript narrowing - 이제 확실히 정의되어 있음
                const text = validatedMessage.text;
                const targetLanguages = validatedMessage.targetLanguages;
                const jobId = validatedMessage.jobId;
                // logger.info(
                //   {
                //     text: text.substring(0, 50),
                //     languageCount: targetLanguages.length,
                //     clientId,
                //   },
                //   "WebSocket translate request received"
                // );
                // 각 언어를 완전히 독립적으로 처리 (fire-and-forget)
                targetLanguages.forEach((targetLang) => {
                    this.processLanguageIndependentlyForWebSocket(ws, text, targetLang, validatedMessage.options || {}, jobId // 클라이언트 제공 jobId 전달
                    ).catch((error) => {
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
    async processLanguageIndependentlyForWebSocket(ws, text, targetLang, options, clientJobId // 클라이언트가 제공한 jobId
    ) {
        // 클라이언트 jobId가 있으면 사용, 없으면 서버에서 생성
        const baseJobId = clientJobId || (0, crypto_1.randomUUID)();
        // 언어별로 고유한 jobId 생성 (클라이언트 추적과 일치)
        const jobId = `${baseJobId}-${targetLang}`;
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
                // logger.warn({ jobId, targetLang }, "Text filtered in preprocessing");
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    // ws.send(
                    //   JSON.stringify({
                    //     type: "partial-error",
                    //     jobId,
                    //     data: {
                    //       language: targetLang,
                    //       error: "Text filtered",
                    //       reason: preprocessingResult.filter_reason,
                    //     },
                    //   })
                    // );
                }
                return;
            }
            // Step 3: 전처리 완료 전송
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                // ws.send(
                //   JSON.stringify({
                //     type: "preprocessing-complete",
                //     jobId,
                //     data: {
                //       language: targetLang,
                //       originalText: preprocessingResult.original_text,
                //       preprocessedText: preprocessingResult.preprocessed_text,
                //       detectedLanguage: preprocessingResult.detected_language,
                //       preprocessing_ms: preprocessingResult.preprocessing_time_ms,
                //     },
                //   })
                // );
            }
            // Step 4: 번역 (단일 언어)
            // const preprocessingResult = {
            //   preprocessed_text: text,
            //   detected_language: "ko",
            //   original_text: text,
            //   preprocessing_time_ms: 0,
            //   filtered: false,
            //   filter_reason: "",
            // };
            const grpcResult = await cache_service_1.cacheService.translate({
                text: preprocessingResult.preprocessed_text,
                source_lang: preprocessingResult.detected_language,
                // text: text,
                // source_lang: "ko",
                target_langs: [targetLang],
                use_cache: false,
                cache_strategy: "hybrid",
                translator_name: "vllm",
            });
            const totalDuration = performance.now() - startTime;
            // Step 5: 번역 완료 전송
            if (grpcResult.translations[targetLang]) {
                this.wsTranslationCompleteCounter++; // RPS 카운터
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "partial-translation",
                        jobId,
                        data: {
                            language: targetLang,
                            translation: grpcResult.translations[targetLang],
                            cacheHit: grpcResult.cache_hits[targetLang] || false,
                            // translation_ms: translationDuration,
                            // XLSX 로깅용 추가 정보
                            originalText: preprocessingResult.original_text,
                            preprocessedText: preprocessingResult.preprocessed_text,
                            detectedLanguage: preprocessingResult.detected_language,
                            total_ms: totalDuration,
                            preprocessing_ms: preprocessingResult.preprocessing_time_ms,
                            cache_processing_ms: grpcResult.processing_time_ms,
                            cache_look_up_ms: grpcResult.cache_lookup_time_ms,
                            llm_response_ms: grpcResult.llm_response_time_ms,
                            filtered: preprocessingResult.filtered,
                            filter_reason: preprocessingResult.filter_reason,
                        },
                    }));
                }
                // logger.info(
                //   {
                //     jobId,
                //     targetLang,
                //     duration: totalDuration,
                //   },
                //   "Independent WebSocket translation completed"
                // );
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
    // RPS 조회 함수
    getRpsMetrics() {
        return {
            connections: this.wsConnectionCounter,
            translateRequest: this.lastWsTranslateRequestRps,
            translationComplete: this.lastWsTranslationCompleteRps,
        };
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocket.service.js.map