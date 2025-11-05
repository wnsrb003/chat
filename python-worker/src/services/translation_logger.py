import csv
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple
from loguru import logger


class TranslationLogger:
    """비동기 큐 기반 번역 로깅 (100개씩 분할 + 통합 파일)"""

    def __init__(self, log_dir: str = "logs/translations", records_per_file: int = 100, batch_size: int = 10):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.records_per_file = records_per_file  # 파일당 레코드 수
        self.batch_size = batch_size  # 배치 쓰기 크기

        # 비동기 큐
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self.is_running = False
        self.background_task: Optional[asyncio.Task] = None

        # CSV 헤더
        self.headers = [
            "timestamp",
            "original_text",
            "translated_text",
            "processing_time_ms",
            "preprocessed_text",
            "source_language",
            "target_language",
            "lang_detect_time",
            "translate_processing_time_ms",
            "translate_llm_time_ms",
            "translate_cache_hit_time_ms",
            "filtered",
            "filter_reason",
        ]

    def _get_all_log_file(self) -> Path:
        """통합 로그 파일 경로 (날짜별)"""
        today = datetime.now().strftime("%Y-%m-%d")
        return self.log_dir / f"translations_{today}_all.csv"

    def _get_split_log_file(self) -> Tuple[Path, int]:
        """
        분할 로그 파일 경로 생성 (100개씩)

        Returns:
            (파일 경로, 현재 파일의 레코드 수)
        """
        today = datetime.now().strftime("%Y-%m-%d")
        file_number = 1

        while True:
            file_path = self.log_dir / f"translations_{today}_{file_number:03d}.csv"

            # 파일이 존재하지 않으면 새 파일 시작
            if not file_path.exists():
                return file_path, 0

            # 파일이 존재하면 레코드 수 확인
            try:
                with open(file_path, "r", encoding="utf-8-sig") as f:
                    # 헤더 제외하고 행 수 세기
                    record_count = sum(1 for _ in f) - 1

                    # 100개 미만이면 이 파일에 추가
                    if record_count < self.records_per_file:
                        return file_path, record_count

                    # 100개 이상이면 다음 파일로
                    file_number += 1
            except Exception as e:
                logger.error(f"Failed to count records in {file_path}: {e}")
                return file_path, 0

    def _ensure_header(self, file_path: Path):
        """CSV 파일 헤더 확인 및 생성"""
        if not file_path.exists() or file_path.stat().st_size == 0:
            with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writeheader()

    def start_background_writer(self):
        """백그라운드 로깅 태스크 시작"""
        if not self.is_running:
            self.is_running = True
            self.background_task = asyncio.create_task(self._background_writer())
            logger.info("Translation logger background writer started")

    async def stop_background_writer(self):
        """백그라운드 로깅 태스크 중지"""
        if self.is_running:
            self.is_running = False
            await self.queue.put(None)  # 종료 시그널
            if self.background_task:
                await self.background_task
            logger.info("Translation logger background writer stopped")

    async def _background_writer(self):
        """백그라운드에서 큐의 레코드를 배치로 파일에 쓰기"""
        batch = []

        while self.is_running:
            try:
                # 큐에서 레코드 가져오기 (0.1초 타임아웃)
                try:
                    record = await asyncio.wait_for(self.queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    # 타임아웃 시 배치가 있으면 쓰기
                    if batch:
                        await self._write_batch(batch)
                        batch = []
                    continue

                # 종료 시그널
                if record is None:
                    break

                batch.append(record)

                # 배치 크기 도달 시 쓰기
                if len(batch) >= self.batch_size:
                    await self._write_batch(batch)
                    batch = []

            except Exception as e:
                logger.error(f"Background writer error: {e}", exc_info=True)

        # 남은 배치 쓰기
        if batch:
            await self._write_batch(batch)

        logger.info("Background writer finished")

    async def _write_batch(self, batch: list):
        """배치로 레코드를 파일에 쓰기"""
        if not batch:
            return

        try:
            # 파일 I/O는 블로킹이므로 executor에서 실행
            await asyncio.get_event_loop().run_in_executor(
                None, self._sync_write_batch, batch
            )
        except Exception as e:
            logger.error(f"Failed to write batch: {e}", exc_info=True)

    def _sync_write_batch(self, batch: list):
        """동기 방식으로 배치 쓰기 (executor에서 실행)"""
        try:
            # 1. 통합 파일에 쓰기
            all_file = self._get_all_log_file()
            self._ensure_header(all_file)
            with open(all_file, "a", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writerows(batch)

            # 2. 분할 파일에 쓰기
            split_file, _ = self._get_split_log_file()
            self._ensure_header(split_file)
            with open(split_file, "a", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writerows(batch)

            logger.debug(f"Batch of {len(batch)} records written to CSV")

        except Exception as e:
            logger.error(f"Failed to write batch synchronously: {e}", exc_info=True)

    async def log_translation(
        self,
        original_text: str,
        preprocessed_text: str,
        source_language: str,
        target_language: str,
        translated_text: str,
        processing_time_ms: float,
        lang_detect_time: float,
        translate_processing_time_ms:float,
        translate_llm_time_ms:float,
        translate_cache_hit_time_ms:float,
        filtered: bool = False,
        filter_reason: Optional[str] = None,
    ):
        """
        번역 결과를 비동기 큐에 추가 (논블로킹)

        Args:
            original_text: 원본 텍스트
            translated_text: 번역된 텍스트
            processing_time_ms: 처리 시간 (ms)
            preprocessed_text: 전처리된 텍스트
            source_language: 원본 언어
            target_language: 타겟 언어
            filtered: 필터링 여부
            filter_reason: 필터링 이유
        """
        try:
            # CSV 레코드 생성
            record = {
                "timestamp": datetime.now().isoformat(),
                "original_text": original_text.replace("\n", "\\n"),  # 개행 처리
                "translated_text": translated_text.replace("\n", "\\n"),
                "processing_time_ms": f"{processing_time_ms:.2f}",
                "preprocessed_text": preprocessed_text.replace("\n", "\\n"),
                "source_language": source_language,
                "target_language": target_language,
                "lang_detect_time": f"{lang_detect_time:.2f}",
                "translate_processing_time_ms": translate_processing_time_ms,
                "translate_llm_time_ms": translate_llm_time_ms,
                "translate_cache_hit_time_ms": translate_cache_hit_time_ms,
                "filtered": str(filtered),
                "filter_reason": str(filter_reason) or "",
            }

            # 큐에 추가 (논블로킹)
            try:
                self.queue.put_nowait(record)
            except asyncio.QueueFull:
                logger.warning("Translation log queue is full, dropping record")

        except Exception as e:
            logger.error(f"Failed to queue translation log: {e}", exc_info=True)

    async def log_bulk_translations(
        self,
        original_text: str,
        preprocessed_text: str,
        source_language: str,
        translations: Dict[str, str],
        processing_time_ms: float,
        lang_detect_time: float,
        translate_processing_time_ms:float,
        translate_llm_time_ms:float,
        translate_cache_hit_time_ms:float,
        filtered: bool = False,
        filter_reason: Optional[str] = None,
    ):
        """
        여러 타겟 언어로 번역된 결과를 비동기로 로깅

        Args:
            original_text: 원본 텍스트
            preprocessed_text: 전처리된 텍스트
            processing_time_ms: 처리 시간 (ms)
            source_language: 원본 언어
            translations: 타겟 언어별 번역 결과 딕셔너리 {"en": "Hello", "ja": "こんにちは"}
            filtered: 필터링 여부
            filter_reason: 필터링 이유
        """
        for target_lang, translated_text in translations.items():
            await self.log_translation(
                original_text=original_text,
                preprocessed_text=preprocessed_text,
                source_language=source_language,
                target_language=target_lang,
                translated_text=translated_text,
                processing_time_ms=processing_time_ms,
                lang_detect_time=lang_detect_time,
                translate_processing_time_ms=translate_processing_time_ms,
                translate_llm_time_ms=translate_llm_time_ms,
                translate_cache_hit_time_ms=translate_cache_hit_time_ms,
                filtered=filtered,
                filter_reason=filter_reason,
            )


# 싱글톤 인스턴스
translation_logger = TranslationLogger()
