import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { z } from "zod";
import { queueService } from "./queue.service";
import { cacheGrpcService } from "./cache-grpc.service";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";
import { filter } from "compression";

const wsMessageSchema = z.object({
  type: z.enum(["translate", "ping"]),
  jobId: z.string().optional(), // 클라이언트가 제공하는 요청 추적용 ID
  text: z.string().min(1).max(5000).optional(),
  targetLanguages: z.array(z.string()).min(1).max(10).optional(),
  options: z
    .object({
      expandAbbreviations: z.boolean().optional().default(true),
      filterProfanity: z.boolean().optional().default(false),
      normalizeRepeats: z.boolean().optional().default(true),
      removeEmoticons: z.boolean().optional().default(true),
      fixTypos: z.boolean().optional().default(false),
    })
    .optional(),
});

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();

  // RPS 모니터링
  private wsConnectionCounter = 0;
  private wsTranslateRequestCounter = 0;
  private wsTranslationCompleteCounter = 0;
  private lastWsTranslateRequestRps = 0;
  private lastWsTranslationCompleteRps = 0;

  constructor(server: Server) {
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
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
    });

    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = randomUUID();
      this.clients.set(clientId, ws);
      this.wsConnectionCounter++;

      logger.info({ clientId }, "WebSocket client connected");

      ws.send(
        JSON.stringify({
          type: "connected",
          clientId,
          message: "Connected to translation service",
        })
      );

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          // logger.info({ message, clientId }, "WebSocket message received");
          await this.handleMessage(ws, clientId, message);
        } catch (error) {
          logger.error({ error, clientId }, "WebSocket message error");
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Invalid message format",
            })
          );
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        this.wsConnectionCounter--;
        logger.info({ clientId }, "WebSocket client disconnected");
      });

      ws.on("error", (error) => {
        logger.error({ error, clientId }, "WebSocket error");
      });

      // Heartbeat
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(interval);
        }
      }, 30000);
    });
  }

  private async handleMessage(ws: WebSocket, clientId: string, message: any) {
    try {
      const validatedMessage = wsMessageSchema.parse(message);

      if (validatedMessage.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (validatedMessage.type === "translate") {
        if (!validatedMessage.text || !validatedMessage.targetLanguages) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Missing required fields: text and targetLanguages",
            })
          );
          return;
        }

        this.wsTranslateRequestCounter++; // RPS 카운터

        // TypeScript narrowing - 이제 확실히 정의되어 있음
        const text = validatedMessage.text;
        const targetLanguages = validatedMessage.targetLanguages;
        const jobId = validatedMessage.jobId;

        logger.info(
          {
            text: text.substring(0, 50),
            languageCount: targetLanguages.length,
            clientId,
          },
          "WebSocket translate request received"
        );

        // 각 언어를 완전히 독립적으로 처리 (fire-and-forget)
        targetLanguages.forEach((targetLang) => {
          this.processLanguageIndependentlyForWebSocket(
            ws,
            text,
            targetLang,
            validatedMessage.options || {},
            jobId // 클라이언트 제공 jobId 전달
          ).catch((error) => {
            logger.error(
              { error, targetLang, clientId },
              "WebSocket translation error"
            );
          });
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Validation error",
            details: error.errors,
          })
        );
      } else {
        logger.error({ error, clientId }, "Message handling error");
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Internal server error",
          })
        );
      }
    }
  }

  /**
   * 각 언어를 완전히 독립적으로 처리 (전처리 + 번역)
   */
  private async processLanguageIndependentlyForWebSocket(
    ws: WebSocket,
    text: string,
    targetLang: string,
    options: any,
    clientJobId?: string // 클라이언트가 제공한 jobId
  ) {
    // 클라이언트 jobId가 있으면 사용, 없으면 서버에서 생성
    const baseJobId = clientJobId || randomUUID();
    // 언어별로 고유한 jobId 생성 (클라이언트 추적과 일치)
    const jobId = `${baseJobId}-${targetLang}`;
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

      logger.debug({ jobId, targetLang }, "Independent WebSocket job started");

      // Step 2: 전처리 결과 대기
      const preprocessingResult = await queueService.waitForPreprocessing(
        jobId
      );

      if (preprocessingResult.filtered) {
        logger.warn({ jobId, targetLang }, "Text filtered in preprocessing");
        if (ws.readyState === WebSocket.OPEN) {
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
      if (ws.readyState === WebSocket.OPEN) {
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

      const grpcResult = await cacheGrpcService.translate({
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

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
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
            })
          );
        }

        logger.info(
          {
            jobId,
            targetLang,
            duration: totalDuration,
          },
          "Independent WebSocket translation completed"
        );
      }
    } catch (error) {
      logger.error(
        { error, jobId, targetLang },
        "Independent WebSocket translation failed"
      );

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "partial-error",
            jobId,
            data: {
              language: targetLang,
              error: "Translation failed",
              message: error instanceof Error ? error.message : "Unknown error",
            },
          })
        );
      }
    }
  }

  broadcast(message: any) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  close() {
    this.clients.forEach((client) => client.close());
    this.wss.close();
    logger.info("WebSocket server closed");
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
