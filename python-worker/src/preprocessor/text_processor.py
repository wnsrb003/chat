import re
from typing import Optional
from langdetect import detect, LangDetectException
from loguru import logger


# PyKoSpacing import (띄어쓰기 교정)
try:
    from pykospacing import Spacing
    PYKOSPACING_AVAILABLE = True
except ImportError:
    PYKOSPACING_AVAILABLE = False
    logger.warning("PyKoSpacing not available. Spacing correction will be disabled.")

# symspellpy-ko import (맞춤법 교정)
try:
    from symspellpy_ko import KoSymSpell
    from symspellpy import Verbosity
    SYMSPELL_AVAILABLE = True
except ImportError:
    SYMSPELL_AVAILABLE = False
    logger.warning("symspellpy-ko not available. Advanced spell checking will be disabled.")

try:
    import kss

    KSS_AVAILABLE = True
except ImportError:
    KSS_AVAILABLE = False
    logger.warning("kss not available. Sentence segmentation will be disabled.")

class TextPreprocessor:
    """채팅 텍스트 전처리 클래스"""

    # 띄어쓰기 교정 후 다시 붙일 패턴 (붙여쓰기 강제)
    # 예: 복합어, 고유명사, 특정 용어 등
    # 주의: 띄어쓰기된 형태로 매칭해야 함 (예: "오늘 날씨" → "오늘날씨")
    # 얘가 어케 띄울줄 알고 내가 다 하지? 어렵누 
    # 이 다 -> 이다 
    SPACING_PROTECT_PATTERNS = [
        # (띄어쓰기된 패턴, 붙일 패턴)
        (r'오늘 날씨', '오늘날씨'),    # "오늘 날씨" → "오늘날씨"
        (r'어제 날씨', '어제날씨'),    # "어제 날씨" → "어제날씨"
        # (r'([가-힣]+) 님', r'\1님'),  # "홍길동 님" → "홍길동님" (필요시 주석 해제)
        # 필요한 패턴 추가
    ]

    # 자음 축약어 사전 (대폭 확장)
    CONSONANT_ABBR = {
        # 기본 인사/감탄
        "ㅎㅇ": "하이",
        "ㅂㅂ": "바이바이",
        "ㅂㅇ": "바이",
        "ㅌㅌ": "도망가",

        # 감정/반응
        "ㅇㅈ": "인정",
        "ㅁㅊ": "미쳤어",
        "ㄷㄷ": "떨어",
        "ㅜㅜ": "흑흑",
        "ㅠㅠ": "흑흑",
        "ㄲㅂ": "아깝다",
        "ㅅㄱ": "수고",

        # 동의/긍정
        "ㅇㅋ": "오케이",
        "ㄱㅊ": "괜찮아",
        "ㄱㅅ": "감사",

        # 부정/거부
        "ㄴㄴ": "노노",
        "ㅈㅅ": "죄송",
        "ㅁㄹ": "모르겠어",

        # 웃음
        "ㅋㅋ": "하하",
        "ㅎㅎ": "하하",
        "ㄲㅈ": "꺾여",

        # 게임/스트리밍 용어
        "ㅈㅈ": "굿 게임",
        "ㄱㄱ": "고고",
        "ㅅㅅ": "ㅅㅅ",
        "ㅂㅌ": "배틀",
        "ㄹㅇ": "진짜",
        "ㅈㄴ": "진짜",
        "ㅇㄱㄹㅇ": "이거 진짜",
        "ㄹㅈㄷ": "레전드",
        "ㅍㅇㅌ": "파이팅",
    }

    # 신조어 사전 (대폭 확장)
    SLANG_DICT = {
        # 인터넷 신조어
        "ㄹㅈㄷ": "레전드",
        "ㅈㄱㄴ": "지금",
        "레게노": "레전드",
        "갓": "최고",
        "고트": "최고",
        "핵": "엄청",
        "졸라": "엄청",
        "개꿀": "엄청 좋은",
        "꿀잼": "재미있어",
        "노잼": "재미없어",
        "띵작": "명작",
        "명작": "최고작품",
        "갓작": "최고작품",

        # 줄임말
        # "킹받": "화나",
        # "킹받네": "화나네",
        "빡침": "화남",
        "개빡침": "엄청 화남",
        "별로": "그냥 그래",
        "개별로": "정말 안좋아",
        "좋아욥": "좋아요",
        "좋아염": "좋아요",
        "나쁘지않음": "나쁘지않아요",
        "웃김": "웃겨요",
        "웃기네": "웃겨요",
        "인정함": "인정해요",
        "쩔수지": "어쩔수없지",
        "쩔수": "어쩔수없지",
        "까비지": "아깝다",
        "까비": "아깝다",
        "쩔지": "대단하지",

        # 오타 패턴
        "ㅇㅇ": "응",
        "ㄴㄴ": "아니",

        # 영어 섞인 표현
        "굿": "좋아",
        "베드": "나빠",
        "나이스": "좋아",
        "오케이": "괜찮아",
        "베리": "매우",
        "베리굿": "아주좋아",

        # 방송 관련
    }

    # symspell 사전에 오타로 등록된 것들을 추가 교정하는 패턴
    # (symspell이 먼저 실행되고, 이 패턴들이 나중에 적용됨)
    TYPO_PATTERNS = {
        # === 되/돼 관련 (symspell 사전에 오타로 등록됨) ===
        r'\b됬어요\b': '됐어요',
        r'\b됬습니다\b': '됐습니다',
        r'\b됬네요\b': '됐네요',
        r'\b됬다\b': '됐다',
        r'\b됬어\b': '됐어',
        r'\b되요\b': '돼요',
        r'\b되세요\b': '돼세요',
        r'\b안되요\b': '안 돼요',
        r'\b안돼요\b': '안 돼요',

        # === 하려/할려 관련 ===
        r'\b할려고\b': '하려고',
        r'\b할려면\b': '하려면',
        r'\b할려\b': '하려',

        # === 왠/웬 관련 (symspell이 일부 처리) ===
        r'\b왠만\b': '웬만',
        r'\b왠일\b': '웬일',
    }

    # 욕설 패턴 (일부만 예시)
    PROFANITY_PATTERNS = [
        r'\bㅅㅂ\b',
        r'\bㅂㅅ\b',
        r'시발',
        r'씨발',
        r'병신',
        r'ㅈ같',
        r'ㅆ발',
        r'ㅂ신'
    ]

    def __init__(self):
        self.profanity_regex = re.compile('|'.join(self.PROFANITY_PATTERNS), re.IGNORECASE)
        # 오타 패턴 컴파일
        self.typo_patterns = [(re.compile(pattern), replacement) for pattern, replacement in self.TYPO_PATTERNS.items()]

        # PyKoSpacing 초기화 (사용 가능한 경우)
        if PYKOSPACING_AVAILABLE:
            try:
                self.spacing_model = Spacing()
                logger.info("✅ PyKoSpacing model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load PyKoSpacing: {e}")
                self.spacing_model = None
        else:
            self.spacing_model = None

        # symspellpy-ko 초기화 (사용 가능한 경우)
        if SYMSPELL_AVAILABLE:
            try:
                self.sym_spell = KoSymSpell(max_dictionary_edit_distance=2, prefix_length=10)
                self.sym_spell.load_korean_dictionary(decompose_korean=True, load_bigrams=False)
                logger.info("✅ symspellpy-ko spell checker loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load symspellpy-ko: {e}")
                self.sym_spell = None
        else:
            self.sym_spell = None

        # KSS는 lazy loading (fork 이슈 방지)
        # self._kss_splitter = Kss("split_sentences")

    # def _get_kss_splitter(self):
    #     """KSS lazy loading (worker 프로세스에서 독립적으로 로드)"""
    #     if self._kss_splitter is None:
    #         try:
    #             import os
    #             logger.info(f"Initializing KSS in worker process (PID: {os.getpid()})...")
    #             self._kss_splitter = Kss("split_sentences")
    #             logger.info("✅ KSS sentence splitter loaded successfully")
    #         except Exception as e:
    #             logger.error(f"Failed to load KSS: {e}")
    #             self._kss_splitter = False  # 실패 표시
    #     return self._kss_splitter if self._kss_splitter is not False else None

    def detect_language(self, text: str) -> Optional[str]:
        """언어 감지"""
        try:
            # 특수문자와 공백 제거 후 감지
            clean_text = re.sub(r'[^\w\s]', '', text)
            if len(clean_text.strip()) < 3:
                return None
            return detect(clean_text)
        except LangDetectException:
            logger.warning(f"Language detection failed for: {text[:50]}")
            return None

    def remove_html(self, text: str) -> str:
        """HTML 태그 제거"""
        return re.sub(r'<[^>]+>', '', text)

    def should_filter(self, text: str) -> tuple[bool, Optional[str]]:
        """번역이 필요없는 텍스트 필터링"""
        # 너무 짧은 텍스트
        if len(text.strip()) <= 1:
            return True, "Too short"

        # 완전히 특수문자나 숫자만으로 구성
        if re.match(r'^[^\w가-힣]+$', text):
            return True, "Only special characters"

        # 완전히 자음/모음만으로 구성 (ㅋㅋㅋ, ㅠㅠㅠ 등)
        if re.match(r'^[ㄱ-ㅎㅏ-ㅣ\s]+$', text):
            return True, "Only consonants/vowels"

        return False, None

    def normalize_repeats(self, text: str) -> str:
        """반복 문자열 정규화"""
        # 1. 교차 패턴 먼저 처리: ㅋㅌㅋㅌ... → ㅋㅋ, ㅎㅌㅎㅌ → ㅎㅎ
        text = re.sub(r'(ㅋㅌ)+', 'ㅋㅋ', text)
        text = re.sub(r'(ㅎㅌ)+', 'ㅎㅎ', text)
        text = re.sub(r'(ㅋㅎ)+', 'ㅋㅋ', text)

        # 2. 자음/모음 반복: ㅋㅋㅋㅋ... → ㅋㅋ, ㅎㅎㅎㅎ → ㅎㅎ (3개 이상 → 2개)
        text = re.sub(r'([ㄱ-ㅎㅏ-ㅣ])\1{2,}', r'\1\1', text)

        # 3. 특수문자 반복: !!! → !!, ??? → ??, .... → ...
        text = re.sub(r'([!?])\1{2,}', r'\1\1', text)
        text = re.sub(r'(\.\.\.\.+)', '...', text)
        text = re.sub(r'([~])\1{2,}', r'\1\1', text)

        # 4. 같은 단어/문구 반복: "노노노노" → "노노", "아아아" → "아아"
        # 2음절 이상 단어가 3번 이상 반복되면 2번으로
        text = re.sub(r'([가-힣]{2,})\1{2,}', r'\1\1', text)

        # 5. 일반 한글 문자 반복: 하하하하 → 하하 (4개 이상 → 2개)
        text = re.sub(r'([가-힣])\1{3,}', r'\1\1', text)

        # 6. 영어 문자 반복: aaaaa → aa, hahaha → haha (4개 이상 → 2개)
        text = re.sub(r'([a-zA-Z])\1{3,}', r'\1\1', text)

        # 7. 숫자 반복: 1111111 → 11, 000000 → 00 (4개 이상 → 2개)
        text = re.sub(r'(\d)\1{3,}', r'\1\1', text)

        return text

    def remove_emoticons(self, text: str) -> str:
        """이모티콘 문자열 제거 (/웃음/, /오이루/ 등)"""
        text = re.sub(r'/[^/]+/', '', text)
        return text

    def remove_special_patterns(self, text: str) -> str:
        """특수 패턴 제거"""
        # 닉네임 접미사 제거: (2), (3) 등
        text = re.sub(r'\(\d+\)', '', text)

        # 길드/팀 태그 제거: [C9], [G3], [각] 등
        text = re.sub(r'\[[^\]]+\]', '', text)

        return text.strip()

    def expand_abbreviations(self, text: str) -> str:
        """자음 축약어 확장"""
        for abbr, full in self.CONSONANT_ABBR.items():
            # 단어 경계에서만 매칭
            text = re.sub(rf'\b{re.escape(abbr)}\b', full, text)
        return text

    def expand_slang(self, text: str) -> str:
        """신조어 확장"""
        for slang, full in self.SLANG_DICT.items():
            text = re.sub(rf'\b{re.escape(slang)}\b', full, text)
        return text.strip()

    def filter_profanity(self, text: str) -> str:
        """욕설 필터링"""
        return self.profanity_regex.sub('***', text)

    def fix_typos(self, text: str) -> str:
        """오타 및 맞춤법 교정 (symspell + 패턴)"""
        # 1. symspellpy-ko로 단어 단위 교정
        if self.sym_spell:
            words = text.split()
            corrected_words = []

            for word in words:
                # 한글만 포함된 단어만 검사
                if re.search(r'[가-힣]', word):
                    suggestions = self.sym_spell.lookup(
                        word,
                        verbosity=Verbosity.CLOSEST,
                        max_edit_distance=2
                    )
                    if suggestions and suggestions[0].distance > 0:
                        # 교정 제안이 있으면 적용
                        corrected_words.append(suggestions[0].term)
                    else:
                        corrected_words.append(word)
                else:
                    corrected_words.append(word)

            text = ' '.join(corrected_words)

        # 2. 정규식 패턴으로 추가 교정 (사전에 오타로 등록된 것들)
        for pattern, replacement in self.typo_patterns:
            text = pattern.sub(replacement, text)

        return text

    def add_spacing(self, text: str) -> str:
        """
        PyKoSpacing을 사용한 띄어쓰기 교정
        보호 패턴은 PyKoSpacing 후 다시 붙여짐
        """
        if not self.spacing_model:
            return text

        try:
            # 1. PyKoSpacing 실행
            text = self.spacing_model(text)

            # 2. 보호 패턴 적용 (띄어쓰기된 것을 다시 붙임)
            for spaced_pattern, joined_pattern in self.SPACING_PROTECT_PATTERNS:
                text = re.sub(spaced_pattern, joined_pattern, text)

            return text

        except Exception as e:
            logger.warning(f"Spacing correction failed: {e}")
            return text

    def preprocess(
        self,
        text: str,
        expand_abbreviations: bool = True,
        filter_profanity: bool = False,
        normalize_repeats: bool = True,
        remove_emoticons: bool = True,
        fix_typos: bool = True,
        add_spacing: bool = True,  # PyKoSpacing 띄어쓰기 교정
    ) -> tuple[str, bool, Optional[str]]:
        """
        전체 전처리 파이프라인

        Returns:
            (preprocessed_text, filtered, filter_reason)
        """
        original = text

        # 1. HTML 제거
        text = self.remove_html(text)

        # 2. 기본 필터링 체크 (너무 짧거나 길거나 특수문자만) - 50자이하
        if 50 < len(text.strip()) < 1:
            return text, True, "Too short or long"

        if re.match(r'^[^\w가-힣]+$', text):
            return text, True, "Only special characters"
        
        # 3. 특수 패턴 제거
        text = self.remove_special_patterns(text)

        # 4. 반복 문자열 정규화 (필터링 전에 먼저!)
        if normalize_repeats:
            text = self.normalize_repeats(text)

        # 5. 이모티콘 제거
        if remove_emoticons:
            text = self.remove_emoticons(text)

        # 6. 자음 축약어 확장 및 신조어 변환
        if expand_abbreviations:
            text = self.expand_abbreviations(text)
            text = self.expand_slang(text)

        # 7. 오타 및 맞춤법 교정
        # if fix_typos:
        #     text = self.fix_typos(text)

        # 8. 띄어쓰기 교정 (PyKoSpacing)
        if add_spacing:
            # PyKoSpacing을 사용한 띄어쓰기 교정
            # text = self.add_spacing(text)
            # kss를 사용한 띄어쓰기 교저
            text = kss.correct_spacing(text)

        # 9. 욕설 필터링
        if filter_profanity:
            text = self.filter_profanity(text)

        # 10. 공백 정리
        text = re.sub(r'\s+', ' ', text).strip()

        # 일단 넘겨
        # 11. 전처리 후 자음/모음만 남았는지 체크
        # if re.match(r'^[ㄱ-ㅎㅏ-ㅣ\s]+$', text):
        #     return text, True, "Only consonants/vowels after preprocessing"

        # 12. 전처리 후 너무 짧아진 경우
        if len(text) < 1:
            return text, True, "Too short after preprocessing"

        # 13. KSS로 문장 분리 + ||| 구분자로 연결
        try:
            sentences = kss.split_sentences(text)
            text = "|||".join(sentences)
            # logger.info(f"Preprocessed: '{original}' → '{text}' ({len(sentences)} sentences)")
            
        except Exception as e:
            logger.warning(f"Sentence splitting failed: {e}, using original text")
            logger.info(f"Preprocessed: '{original}' → '{text}'")

        return text, False, None
