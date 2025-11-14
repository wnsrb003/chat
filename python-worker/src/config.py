import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str | None = None

    # Queue
    queue_name: str = "translation-jobs"
    worker_concurrency: int = 100

    # VLLM
    vllm_url: str = "http://192.168.190.143:8000/v1/chat/completions"
    vllm_timeout: int = 30

    # Ollama
    ollama_url: str = "http://localhost:11434/api/chat"
    ollama_model: str = "zongwei/gemma3-translator:1b"
    ollama_timeout: int = 30

    # Caching Server
    caching_url: str = "http://192.168.190.158:8000/api/v1/translate"
    caching_grpc_url: str = "192.168.190.158:50051"  # gRPC 주소
    caching_timeout: int = 30
    use_grpc: bool = True  # True: gRPC (빠름), False: HTTP

    # Translation Service Selection
    use_ollama: bool = False  # True: Ollama, False: Cache

    # Logging
    log_level: str = "DEBUG"  # DEBUG로 변경 (문제 진단용)
    enable_translation_logging: bool = False  # CSV 로깅 비활성화 (성능 향상)

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
