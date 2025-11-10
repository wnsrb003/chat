import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { format } from "date-fns";
import { logger } from "../utils/logger";
import * as XLSX from "xlsx";

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

interface XlsxRow {
  timestamp: string;
  original_text: string;
  preprocessed_text: string;
  detected_language: string;
  translation_lang: string;
  translation_text: string;
  total_time_ms: number;
  preprocessing_time_ms: number;
  translation_time_ms: number;
  cache_hits: boolean;
  cache_processing_ms: number;
  filtered: boolean;
  filter_reason: string;
}

class XlsxLoggerService {
  private logsDir: string;

  constructor() {
    // logs 디렉토리 경로 (api-gateway/logs)
    this.logsDir = join(__dirname, "../../logs");
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
    return join(this.logsDir, `translations_${today}.xlsx`);
  }

  logTranslation(entry: TranslationLogEntry) {
    try {
      const filePath = this.getFilePath();

      // 번역된 언어 추출
      const translationLang = Object.keys(entry.translations).find(
        (lang) => entry.translations[lang as keyof typeof entry.translations]
      );

      if (!translationLang && !entry.filtered) {
        logger.warn("No translation language found in entry");
        return;
      }

      const translationText = translationLang
        ? entry.translations[translationLang as keyof typeof entry.translations] || ""
        : "";

      // 새 로우 데이터
      const newRow: XlsxRow = {
        timestamp: entry.timestamp,
        original_text: entry.originalText,
        preprocessed_text: entry.preprocessedText,
        detected_language: entry.detectedLanguage,
        translation_lang: translationLang || "",
        translation_text: translationText,
        total_time_ms: entry.timings.totalMs,
        preprocessing_time_ms: entry.timings.preprocessingMs,
        translation_time_ms: entry.timings.translationMs,
        cache_hits: entry.cacheHits,
        cache_processing_ms: entry.cacheProcessingMs,
        filtered: entry.filtered,
        filter_reason: entry.filterReason || "",
      };

      let workbook: XLSX.WorkBook;
      let worksheet: XLSX.WorkSheet;
      let existingData: XlsxRow[] = [];

      // 기존 파일이 있으면 읽기
      if (existsSync(filePath)) {
        workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        worksheet = workbook.Sheets[sheetName];
        existingData = XLSX.utils.sheet_to_json<XlsxRow>(worksheet);
      } else {
        workbook = XLSX.utils.book_new();
      }

      // 새 데이터 추가
      existingData.push(newRow);

      // 워크시트 생성 (헤더 포함)
      worksheet = XLSX.utils.json_to_sheet(existingData, {
        header: [
          "timestamp",
          "original_text",
          "preprocessed_text",
          "detected_language",
          "translation_lang",
          "translation_text",
          "total_time_ms",
          "preprocessing_time_ms",
          "translation_time_ms",
          "cache_hits",
          "cache_processing_ms",
          "filtered",
          "filter_reason",
        ],
      });

      // 컬럼 너비 자동 조정
      const colWidths = [
        { wch: 20 }, // timestamp
        { wch: 50 }, // original_text
        { wch: 50 }, // preprocessed_text
        { wch: 15 }, // detected_language
        { wch: 15 }, // translation_lang
        { wch: 50 }, // translation_text
        { wch: 15 }, // total_time_ms
        { wch: 20 }, // preprocessing_time_ms
        { wch: 20 }, // translation_time_ms
        { wch: 12 }, // cache_hits
        { wch: 20 }, // cache_processing_ms
        { wch: 10 }, // filtered
        { wch: 30 }, // filter_reason
      ];
      worksheet["!cols"] = colWidths;

      // 워크북에 시트 추가 (기존 시트 제거 후)
      if (workbook.SheetNames.length > 0) {
        delete workbook.Sheets[workbook.SheetNames[0]];
        workbook.SheetNames = [];
      }
      XLSX.utils.book_append_sheet(workbook, worksheet, "Translations");

      // 파일로 저장
      XLSX.writeFile(workbook, filePath);

      logger.debug({ filePath, rowCount: existingData.length }, "XLSX log written");
    } catch (error) {
      logger.error({ error }, "Failed to write XLSX log");
    }
  }

  close() {
    logger.info("XLSX logger closed");
  }
}

export const xlsxLoggerService = new XlsxLoggerService();
