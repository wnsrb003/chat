from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class PreprocessOptions(BaseModel):
    expand_abbreviations: bool = Field(default=True, alias='expandAbbreviations')
    filter_profanity: bool = Field(default=False, alias='filterProfanity')
    normalize_repeats: bool = Field(default=True, alias='normalizeRepeats')
    remove_emoticons: bool = Field(default=True, alias='removeEmoticons')
    fix_typos: bool = Field(default=True, alias='fixTypos')
    add_spacing: bool = Field(default=True, alias='addSpacing')

    class Config:
        populate_by_name = True


class TranslationJob(BaseModel):
    id: str
    text: str
    target_languages: List[str] = Field(alias='targetLanguages')
    options: Optional[PreprocessOptions] = Field(default_factory=PreprocessOptions)
    created_at: int = Field(alias='createdAt')

    class Config:
        populate_by_name = True


class TranslationResult(BaseModel):
    id: str
    original_text: str
    preprocessed_text: str
    translations: Dict[str, str]
    detected_language: str
    processing_time: float
    filtered: bool
    filter_reason: Optional[str] = None
