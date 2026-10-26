import logging
import os
import re
import time

import openai

from .base import ProviderError

log = logging.getLogger(__name__)


class NvidiaLLM:
    def __init__(self) -> None:
        self.model = os.getenv("NVIDIA_LLM_MODEL", "nvidia/nemotron-3-super-120b-a12b")
        self.client = openai.OpenAI(
            base_url=os.getenv("NVIDIA_LLM_BASE_URL", "https://integrate.api.nvidia.com/v1"),
            api_key=os.environ["NVIDIA_API_KEY"],
            timeout=900,
            max_retries=0,
        )

    def complete(self, prompt: str, reasoning: bool, max_tokens: int) -> str:
        last = None
        for attempt in range(3):
            try:
                resp = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.6 if reasoning else 0.2,
                    max_tokens=max_tokens,
                    extra_body={"chat_template_kwargs": {"enable_thinking": reasoning}},
                )
                text = resp.choices[0].message.content or ""
                return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
            except (openai.APIConnectionError, openai.APITimeoutError, openai.RateLimitError, openai.InternalServerError) as e:
                last = f"{type(e).__name__}: {e}"
                wait = (30 if isinstance(e, openai.RateLimitError) else 5) * 2 ** attempt
                log.warning("LLM attempt %d failed (%s), retrying in %ds", attempt + 1, type(e).__name__, wait)
                time.sleep(wait)
            except openai.APIStatusError as e:
                raise ProviderError(f"LLM request rejected ({e.status_code}): {e.message}") from e
        raise ProviderError(f"LLM failed after 3 attempts. {last}")
