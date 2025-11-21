# 음역 기반 번역 데이터셋 생성기

특수명칭(고유명사/플랫폼 용어)을 의미 번역이 아니라 **소리나는 대로(phonetic transliteration)** 번역하도록 학습시키는 LLM을 위한 데이터셋 자동 생성 스크립트입니다.

## 🎯 목표

채팅/스트리밍 플랫폼에서 사용되는 고유명칭을 번역 시 음역(transliteration)으로 처리하는 번역 모델을 학습하기 위한 병렬 데이터셋을 생성합니다.

**예시:**
- ❌ "별풍" → "Star Balloon" (의미 번역)
- ✅ "별풍" → "byeolpung" (음역)

## 📦 지원 기능

### 1. 다국어 음역 (Transliteration)
- **한국어 (ko)**: Revised Romanization
- **중국어 (zh)**: pypinyin (선택적)
- **태국어 (th)**: epitran (선택적)
- **영어 (en)**: 그대로 유지

### 2. 모든 언어 쌍 쌍방향 데이터
- ko ↔ en, ko ↔ zh, ko ↔ th
- en ↔ zh, en ↔ th
- zh ↔ th
- 총 **12가지 번역 방향**

### 3. 오타/변형 포함
채팅 환경의 실제 오타를 반영:
- 글자 삭제
- 인접 문자 스왑
- 중복 삽입
- 자음/모음 변경

### 4. 문장 템플릿 기반 생성
단독 단어뿐 아니라 문맥 속 고유명칭 사용:
```
"치찌뿡님이 별풍 100개를 보냈습니다."
→ "chijjippung sent 100 byeol pung(s)."
```

## 🚀 사용법

### 기본 실행

```bash
python3 generate_transliteration_dataset.py
```

기본 설정:
- 출력: `transliteration_dataset.jsonl`
- 고유명칭당 예제 수: 10개
- 음역 비율: 25%
- 오타 확률: 20%
- 언어: ko, en, zh, th

### CLI 옵션

```bash
python3 generate_transliteration_dataset.py \
  --out output.jsonl \
  --n-per-name 10 \
  --translit-ratio 0.25 \
  --typo-prob 0.2 \
  --languages ko,en,zh,th \
  --seed 42
```

#### 옵션 설명

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--out` | `transliteration_dataset.jsonl` | 출력 JSONL 파일 경로 |
| `--n-per-name` | `10` | 고유명칭당 생성할 예제 수 |
| `--translit-ratio` | `0.25` | 음역 단독 데이터 비율 (0.0~1.0) |
| `--typo-prob` | `0.2` | 오타 생성 확률 (0.0~1.0) |
| `--languages` | `ko,en,zh,th` | 지원 언어 (쉼표 구분) |
| `--seed` | `42` | 랜덤 시드 (재현성) |

### 예제

#### 1. 한국어-영어만 생성
```bash
python3 generate_transliteration_dataset.py \
  --languages ko,en \
  --n-per-name 20 \
  --out ko_en_dataset.jsonl
```

#### 2. 오타 없는 깨끗한 데이터셋
```bash
python3 generate_transliteration_dataset.py \
  --typo-prob 0.0 \
  --out clean_dataset.jsonl
```

#### 3. 대량 데이터 생성 (Gemma 3-4B 파인튜닝용)
```bash
python3 generate_transliteration_dataset.py \
  --n-per-name 100 \
  --translit-ratio 0.3 \
  --out large_dataset.jsonl
```

예상 샘플 수: 10개 고유명칭 × 100 × 12개 언어 쌍 = **12,000개**

## 📋 출력 포맷

JSONL 형식 (각 줄이 하나의 JSON 객체):

```json
{
  "src": "치찌뿡님이 별풍 100개를 보냈습니다.",
  "tgt": "chijjippung sent 100 byeol pung(s).",
  "src_lang": "ko",
  "tgt_lang": "en",
  "task": "translate_ko_to_en"
}
```

**필드 설명:**
- `src`: 소스 텍스트
- `tgt`: 타겟 텍스트 (고유명칭 음역 포함)
- `src_lang`: 소스 언어 코드
- `tgt_lang`: 타겟 언어 코드 (또는 "romanized")
- `task`: 태스크 ID

## 🔧 커스터마이징

### 고유명칭 추가

스크립트 내 `names_by_lang` 딕셔너리를 수정:

```python
names_by_lang = {
    "ko": [
        "별풍", "치찌뿡", "쭈꾸미",  # 기존
        "새로운고유명칭1", "새로운고유명칭2"  # 추가
    ],
    "en": [...],
    ...
}
```

### 템플릿 추가

언어별 템플릿 리스트를 수정:

```python
DEFAULT_TEMPLATES_KO = [
    "{name}님이 별풍 {n}개를 후원했습니다.",
    "{name}님의 새로운 템플릿",  # 추가
    ...
]
```

## 📊 데이터셋 통계

기본 설정 (10개 고유명칭, n-per-name=10, 4개 언어):

| 항목 | 값 |
|------|------|
| 총 예제 수 | 1,200개 |
| 언어 쌍 | 12개 |
| 음역 전용 데이터 | ~300개 (25%) |
| 문장 데이터 | ~900개 (75%) |

**권장 데이터셋 크기 (Gemma 3-4B):**
- 최소: 5만 샘플
- 권장: 10만~20만 샘플
- `--n-per-name 500~1000` 설정 권장

## ⚙️ 의존성

### 필수
- Python 3.7+
- 없음 (기본 라이브러리만 사용)

### 선택적 (더 나은 음역을 위해)

```bash
# 중국어 음역
pip install pypinyin

# 태국어 음역
pip install epitran
```

없어도 작동하지만, 해당 언어는 원문 그대로 반환됩니다.

## 🎓 Gemma 3-4B 파인튜닝 가이드

### 1. 데이터셋 생성
```bash
python3 generate_transliteration_dataset.py \
  --n-per-name 1000 \
  --translit-ratio 0.3 \
  --typo-prob 0.15 \
  --out gemma_training.jsonl
```

### 2. 데이터셋 분할
```bash
# 학습:검증:테스트 = 8:1:1
total=$(wc -l < gemma_training.jsonl)
train=$((total * 8 / 10))
val=$((total * 1 / 10))

head -n $train gemma_training.jsonl > train.jsonl
tail -n +$((train + 1)) gemma_training.jsonl | head -n $val > val.jsonl
tail -n +$((train + val + 1)) gemma_training.jsonl > test.jsonl
```

### 3. 학습 (Hugging Face Transformers 예시)
```python
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

model = AutoModelForCausalLM.from_pretrained("google/gemma-2-4b")
tokenizer = AutoTokenizer.from_pretrained("google/gemma-2-4b")

# ... 데이터셋 로드 및 전처리

training_args = TrainingArguments(
    output_dir="./gemma-transliteration",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    learning_rate=2e-5,
    ...
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
)

trainer.train()
```

## 📝 예제 출력

```bash
$ python3 generate_transliteration_dataset.py --n-per-name 3 --languages ko,en

🚀 데이터셋 생성 시작...
  언어: ['ko', 'en']
  고유명칭당 예제 수: 3
  음역 비율: 0.25
  오타 확률: 0.2
  랜덤 시드: 42
✅ 총 60개 예제 생성 완료!
💾 저장 완료: transliteration_dataset.jsonl

📝 샘플 예제 (처음 5개):

[1] translate_ko_to_en
  src (ko): 별풍님이 13개의 별풍을 보냈습니다.
  tgt (en): byeolput sent 13 item(s).

[2] translate_ko_to_en
  src (ko): 별풍이(가) 72개 보냈습니다.
  tgt (en): Viewer byeolput has entered.
```

## 🤝 기여

고유명칭, 템플릿, 음역 규칙 개선은 언제든 환영합니다!

## 📜 라이센스

MIT License
