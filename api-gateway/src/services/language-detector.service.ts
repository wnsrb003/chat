import { franc } from "franc-min";

// franc ISO 639-3 → 지원 언어 코드 매핑
const LANG_MAP: Record<string, string> = {
  eng: "en",
  kor: "ko",
  cmn: "zh-CN", // Mandarin Chinese (간체)
  zho: "zh-CN", // Chinese (generic)
  tha: "th",
};

// 지원 언어 목록
const SUPPORTED_LANGS = ["en", "ko", "zh-CN", "zh-TW", "th"];

export function detectLanguage(text: string): string {
  if (!text || text.trim().length < 3) {
    return "etc";
  }

  // franc로 언어 감지 (ISO 639-3 코드 반환)
  const detected = franc(text);

  if (detected === "und") {
    return "ko";
  }

  // // 매핑된 코드로 변환
  const mapped = LANG_MAP[detected];

  // // 지원 언어면 반환, 아니면 'etc'
  if (mapped && SUPPORTED_LANGS.includes(mapped)) {
    return mapped;
  }

  return detected;
}
