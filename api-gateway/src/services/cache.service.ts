import { config } from "../config";
import { cacheGrpcService } from "./cache-grpc.service";
import { cacheHttpService } from "./cache-http.service";
import type { TranslateParams, TranslationResult } from "./cache-grpc.service";

/**
 * Cache Service Factory
 * config에 따라 gRPC 또는 HTTP 서비스 선택
 */
class CacheService {
  private service: typeof cacheGrpcService | typeof cacheHttpService;

  constructor() {
    if (config.cacheService.protocol === "http") {
      this.service = cacheHttpService;
    } else {
      this.service = cacheGrpcService;
    }
  }

  async translate(params: TranslateParams): Promise<TranslationResult> {
    return this.service.translate(params);
  }

  // async batchTranslate(requests: TranslateParams[]): Promise<{
  //   responses: TranslationResult[];
  //   total_processing_time_ms: number;
  //   success_count: number;
  //   error_count: number;
  // }> {
  //   return this.service.batchTranslate(requests);
  // }

  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    details: Record<string, string>;
  }> {
    return this.service.healthCheck();
  }

  getRpsMetrics() {
    return this.service.getRpsMetrics();
  }

  getProtocol() {
    return config.cacheService.protocol;
  }
}

// Singleton 인스턴스
export const cacheService = new CacheService();

// 타입 export
export type { TranslateParams, TranslationResult };
