import { config } from "../config";
import { logger } from "../utils/logger";

// TypeScript 타입 정의 (gRPC와 동일)
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
 * Cache Service HTTP 클라이언트
 * Node.js 내장 fetch를 활용한 HTTP 통신
 */
class CacheHttpService {
  private readonly baseUrl: string;
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
    this.baseUrl = config.cacheService.httpUrl;
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
      msg: "CacheHttpService initialized",
      httpUrl: this.baseUrl,
      timeout: this.timeout,
    });
  }

  /**
   * 번역 요청 (Promise 기반 비동기)
   */
  async translate(params: TranslateParams): Promise<TranslationResult> {
    this.translateRequestCounter++; // RPS 카운터

    const startTime = Date.now();

    const requestBody = {
      text: params.text,
      source_lang: params.source_lang,
      target_langs: params.target_langs,
      use_cache: params.use_cache ?? false,
      cache_strategy: params.cache_strategy || "hybrid",
      translator_name: params.translator_name || "vllm",
    };

    logger.debug({
      msg: "HTTP Translate request",
      request: requestBody,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/v1/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      if (!response.ok) {
        this.translateResponseCounter++; // 응답 카운터 (에러도 응답)
        this.translateErrorCounter++; // 에러 카운터

        const errorText = await response.text();
        logger.error({
          msg: "HTTP Translate error",
          status: response.status,
          error: errorText,
          duration,
        });

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as TranslationResult;

      this.translateResponseCounter++; // 응답 카운터 (성공)
      this.translateCompleteCounter++; // 완료 카운터

      logger.debug({
        msg: "HTTP Translate response",
        success: data.success,
        duration,
        processingTimeMs: data.processing_time_ms,
      });

      return {
        original_text: data.original_text,
        source_lang: data.source_lang,
        translations: data.translations,
        cache_hits: data.cache_hits,
        processing_time_ms: data.processing_time_ms,
        success: data.success,
        error_message: data.error_message,
        cache_lookup_time_ms: data.cache_lookup_time_ms,
        llm_response_time_ms: data.llm_response_time_ms,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.name === "AbortError") {
        this.translateResponseCounter++;
        this.translateErrorCounter++;
        logger.error({
          msg: "HTTP Translate timeout",
          duration,
          timeout: this.timeout,
        });
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      this.translateResponseCounter++;
      this.translateErrorCounter++;
      logger.error({
        msg: "HTTP Translate error",
        error: error.message,
        duration,
      });
      throw error;
    }
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

  //   const requestBody = {
  //     requests: requests.map((req) => ({
  //       text: req.text,
  //       source_lang: req.source_lang,
  //       target_langs: req.target_langs,
  //       use_cache: req.use_cache ?? true,
  //       cache_strategy: req.cache_strategy || "hybrid",
  //       translator_name: req.translator_name || "vllm",
  //     })),
  //   };

  //   try {
  //     const controller = new AbortController();
  //     const timeoutId = setTimeout(() => controller.abort(), this.timeout);

  //     const response = await fetch(`${this.baseUrl}/batch-translate`, {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify(requestBody),
  //       signal: controller.signal,
  //     });

  //     clearTimeout(timeoutId);

  //     const duration = Date.now() - startTime;

  //     if (!response.ok) {
  //       const errorText = await response.text();
  //       logger.error({
  //         msg: "HTTP BatchTranslate error",
  //         status: response.status,
  //         error: errorText,
  //         duration,
  //       });
  //       throw new Error(`HTTP ${response.status}: ${errorText}`);
  //     }

  //     const data = await response.json();

  //     logger.debug({
  //       msg: "HTTP BatchTranslate response",
  //       successCount: data.success_count,
  //       errorCount: data.error_count,
  //       duration,
  //     });

  //     return {
  //       responses: data.responses,
  //       total_processing_time_ms: data.total_processing_time_ms,
  //       success_count: data.success_count,
  //       error_count: data.error_count,
  //     };
  //   } catch (error: any) {
  //     const duration = Date.now() - startTime;

  //     if (error.name === "AbortError") {
  //       logger.error({
  //         msg: "HTTP BatchTranslate timeout",
  //         duration,
  //         timeout: this.timeout,
  //       });
  //       throw new Error(`Request timeout after ${this.timeout}ms`);
  //     }

  //     logger.error({
  //       msg: "HTTP BatchTranslate error",
  //       error: error.message,
  //       duration,
  //     });
  //     throw error;
  //   }
  // }

  /**
   * Health Check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    details: Record<string, string>;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error({
          msg: "HTTP HealthCheck error",
          status: response.status,
        });
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        healthy: data.healthy,
        status: data.status,
        details: data.details,
      };
    } catch (error: any) {
      logger.error({
        msg: "HTTP HealthCheck error",
        error: error.message,
      });
      throw error;
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
export const cacheHttpService = new CacheHttpService();
