import { createWriteStream, existsSync, mkdirSync, WriteStream } from "fs";
import { join } from "path";
import { format } from "date-fns";
import { logger } from "../utils/logger";

export interface TranslationLogEntry {
  timestamp: string;
  originalText: string;
  preprocessedText: string;
  detectedLanguage: string;
  translations: {
    en?: string;
    th?: string;
    "zh-CN"?: string;
    "zh-TW"?: string;
  };
  timings: {
    preprocessingMs: number;
    translationMs: number;
    totalMs: number;
  };
  cacheHits: boolean;
  cacheProcessingMs: number;
  filtered: boolean;
  filterReason?: string;
}

class CsvLoggerService {
  private logsDir: string;
  private currentDate: string;
  private writeStream: WriteStream | null = null;

  constructor() {
    // logs 디렉토리 경로 (api-gateway/logs)
    this.logsDir = join(__dirname, "../../logs");
    this.currentDate = "";
    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory() {
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
      logger.info({ dir: this.logsDir }, "Created logs directory");
    }
  }

  private getFilePath(): string {
    const today = format(new Date(), "yyyy-MM-dd");
    return join(this.logsDir, `translations_${today}.csv`);
  }

  private ensureWriteStream() {
    const today = format(new Date(), "yyyy-MM-dd");
    const filePath = this.getFilePath();

    // 날짜가 바뀌었거나 스트림이 없으면 새로 생성
    if (this.currentDate !== today || !this.writeStream) {
      this.closeWriteStream();

      const fileExists = existsSync(filePath);
      this.writeStream = createWriteStream(filePath, { flags: "a" });
      this.currentDate = today;

      // 파일이 새로 생성된 경우 헤더 작성
      if (!fileExists) {
        this.writeHeader();
      }

      logger.info({ filePath }, "CSV logger initialized");
    }
  }

  private writeHeader() {
    if (!this.writeStream) return;

    const header = [
      "timestamp",
      "original_text",
      "preprocessed_text",
      "detected_language",
      "translation_lang",
      "translation_text",
      "total_time_ms(번역요청-번역응답까지 시간)",
      "preprocessing_time_ms",
      "translation_time_ms(캐싱서버 요청 응답 시간)",
      "cache_hits(캐싱 여부)",
      "cache_processing_ms(캐싱 백엔드 전체시간)",
      "filtered",
      "filter_reason",
    ].join(",");

    this.writeStream.write(header + "\n");
  }

  private escapeCsvField(value: string): string {
    // CSV 필드 이스케이프: 따옴표, 개행, 쉼표 처리
    if (value.includes('"') || value.includes(",") || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  logTranslation(entry: TranslationLogEntry) {
    try {
      this.ensureWriteStream();

      if (!this.writeStream) {
        logger.error("Write stream not available");
        return;
      }

      console.log(entry, "@@");
      const translationLang = Object.keys(entry.translations).pop();
      if (!translationLang) return;
      const translationText = entry.translations?.[translationLang].join(" | ");
      const row = [
        entry.timestamp,
        this.escapeCsvField(entry.originalText),
        this.escapeCsvField(entry.preprocessedText),
        entry.detectedLanguage,
        translationLang,
        translationText,
        // this.escapeCsvField(entry.translations.en || ""),
        // this.escapeCsvField(entry.translations.th || ""),
        // this.escapeCsvField(entry.translations["zh-CN"] || ""),
        // this.escapeCsvField(entry.translations["zh-TW"] || ""),
        entry.timings.preprocessingMs.toString(),
        entry.timings.translationMs.toString(),
        entry.timings.totalMs.toString(),
        this.escapeCsvField(entry.cacheHits.toString()),
        entry.cacheProcessingMs.toString(),
        entry.filtered.toString(),
        this.escapeCsvField(entry.filterReason || ""),
      ].join(",");

      this.writeStream.write(row + "\n");
    } catch (error) {
      logger.error({ error }, "Failed to write translation log");
    }
  }

  private closeWriteStream() {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  close() {
    this.closeWriteStream();
    logger.info("CSV logger closed");
  }
}

export const csvLoggerService = new CsvLoggerService();
