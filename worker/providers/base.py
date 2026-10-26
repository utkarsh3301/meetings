"""Provider adapter. Pipeline code only talks to these interfaces; models are picked by env config."""
from typing import Protocol


class ProviderError(Exception):
    """An AI call failed after retries. Job stops in NEEDS_ATTENTION; never rerouted to another provider."""


class ASR(Protocol):
    model: str

    def transcribe(self, pcm: bytes, language: str) -> tuple[str, str | None]:
        """16 kHz mono s16le PCM in, (text, detected language) out."""
        ...


class LLM(Protocol):
    model: str

    def complete(self, prompt: str, reasoning: bool, max_tokens: int) -> str: ...


def get_asr() -> ASR:
    from .nvidia_asr import NvidiaASR

    return NvidiaASR()


def get_llm() -> LLM:
    from .nvidia_llm import NvidiaLLM

    return NvidiaLLM()
