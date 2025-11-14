import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { config } from "../config";
import { logger } from "../utils/logger";

// Proto 파일 경로
const PROTO_PATH = path.join(__dirname, "../../proto/translation.proto");

// Proto 로더 옵션
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const translationProto = protoDescriptor.translation;

// TypeScript 타입 정의
export interface TranslationResult {
  original_text: string;
  source_lang: string;
  translations: Record<string, string>;
  cache_hits: Record<string, boolean>;
  processing_time_ms: number;
  success: boolean;
  error_message?: string;
  cache_lookup_time_ms?: number;
  llm_response_time_ms?: Record<string, number>;
}

export interface TranslateParams {
  text: string;
  source_lang: string;
  target_langs: string[];
  use_cache?: boolean;
  cache_strategy?: string;
  translator_name?: string;
}

/**
 * Cache Service gRPC 클라이언트
 * Node.js에서 비동기 I/O를 활용하여 동시성 제어 없이 gRPC 통신 처리
 */
class CacheGrpcService {
  private client: any;
  private readonly timeout: number;

  // RPS 모니터링
  private translateRequestCounter = 0;
  private translateResponseCounter = 0; // complete + error (총 응답 수)
  private translateCompleteCounter = 0;
  private translateErrorCounter = 0;
  private lastTranslateRequestRps = 0;
  private lastTranslateResponseRps = 0;
  private lastTranslateCompleteRps = 0;
  private lastTranslateErrorRps = 0;

  constructor() {
    // gRPC 채널 생성 (connection pooling 자동 관리)
    this.client = new translationProto.TranslationService(
      config.cacheService.grpcUrl,
      grpc.credentials.createInsecure()
    );

    this.timeout = config.cacheService.timeout;

    // RPS 모니터링 (1초마다)
    setInterval(() => {
      this.lastTranslateRequestRps = this.translateRequestCounter;
      this.lastTranslateResponseRps = this.translateResponseCounter;
      this.lastTranslateCompleteRps = this.translateCompleteCounter;
      this.lastTranslateErrorRps = this.translateErrorCounter;

      this.translateRequestCounter = 0;
      this.translateResponseCounter = 0;
      this.translateCompleteCounter = 0;
      this.translateErrorCounter = 0;
    }, 1000);

    logger.info({
      msg: "CacheGrpcService initialized",
      grpcUrl: config.cacheService.grpcUrl,
      timeout: this.timeout,
    });
  }

  /**
   * 번역 요청 (Promise 기반 비동기)
   */
  async translate(params: TranslateParams): Promise<TranslationResult> {
    this.translateRequestCounter++; // RPS 카운터

    const startTime = Date.now();

    const request = {
      text: params.text,
      source_lang: params.source_lang,
      target_langs: params.target_langs,
      use_cache: params.use_cache ?? true,
      cache_strategy: params.cache_strategy || "hybrid",
      translator_name: params.translator_name || "vllm",
    };

    logger.debug({
      msg: "gRPC Translate request",
      request,
    });

    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + this.timeout);

      this.client.Translate(
        request,
        { deadline },
        (error: grpc.ServiceError | null, response: any) => {
          const duration = Date.now() - startTime;

          if (error) {
            this.translateResponseCounter++; // 응답 카운터 (에러도 응답)
            this.translateErrorCounter++; // 에러 카운터
            logger.error({
              msg: "gRPC Translate error",
              error: error.message,
              code: error.code,
              duration,
            });
            reject(error);
            return;
          }

          this.translateResponseCounter++; // 응답 카운터 (성공)
          this.translateCompleteCounter++; // 완료 카운터

          logger.debug({
            msg: "gRPC Translate response",
            success: response.success,
            duration,
            processingTimeMs: response.processing_time_ms,
          });

          resolve({
            original_text: response.original_text,
            source_lang: response.source_lang,
            translations: response.translations,
            cache_hits: response.cache_hits,
            processing_time_ms: response.processing_time_ms,
            success: response.success,
            error_message: response.error_message,
            cache_lookup_time_ms: response.cache_lookup_time_ms,
            llm_response_time_ms: response.llm_response_time_ms,
          });
        }
      );
    });
  }

  /**
   * 배치 번역 요청
   */
  // async batchTranslate(requests: TranslateParams[]): Promise<{
  //   responses: TranslationResult[];
  //   total_processing_time_ms: number;
  //   success_count: number;
  //   error_count: number;
  // }> {
  //   const startTime = Date.now();

  //   const batchRequest = {
  //     requests: requests.map((req) => ({
  //       text: req.text,
  //       source_lang: req.source_lang,
  //       target_langs: req.target_langs,
  //       use_cache: req.use_cache ?? true,
  //       cache_strategy: req.cache_strategy || "hybrid",
  //       translator_name: req.translator_name || "vllm",
  //     })),
  //   };

  //   return new Promise((resolve, reject) => {
  //     const deadline = new Date(Date.now() + this.timeout);

  //     this.client.BatchTranslate(
  //       batchRequest,
  //       { deadline },
  //       (error: grpc.ServiceError | null, response: any) => {
  //         const duration = Date.now() - startTime;

  //         if (error) {
  //           logger.error({
  //             msg: "gRPC BatchTranslate error",
  //             error: error.message,
  //             code: error.code,
  //             duration,
  //           });
  //           reject(error);
  //           return;
  //         }

  //         logger.debug({
  //           msg: "gRPC BatchTranslate response",
  //           successCount: response.success_count,
  //           errorCount: response.error_count,
  //           duration,
  //         });

  //         resolve({
  //           responses: response.responses,
  //           total_processing_time_ms: response.total_processing_time_ms,
  //           success_count: response.success_count,
  //           error_count: response.error_count,
  //         });
  //       }
  //     );
  //   });
  // }

  /**
   * Health Check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    details: Record<string, string>;
  }> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 5000); // 5초 타임아웃

      this.client.HealthCheck(
        {},
        { deadline },
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            logger.error({
              msg: "gRPC HealthCheck error",
              error: error.message,
              code: error.code,
            });
            reject(error);
            return;
          }

          resolve({
            healthy: response.healthy,
            status: response.status,
            details: response.details,
          });
        }
      );
    });
  }

  /**
   * 연결 종료
   */
  close() {
    if (this.client) {
      grpc.closeClient(this.client);
      logger.info("CacheGrpcService connection closed");
    }
  }

  /**
   * RPS 메트릭 조회
   */
  getRpsMetrics() {
    return {
      request: this.lastTranslateRequestRps,
      response: this.lastTranslateResponseRps, // 총 응답 (complete + error)
      complete: this.lastTranslateCompleteRps,
      error: this.lastTranslateErrorRps,
    };
  }
}

// Singleton 인스턴스
export const cacheGrpcService = new CacheGrpcService();
