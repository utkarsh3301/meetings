import logging
import os
import time

import grpc
import riva.client

from .base import ProviderError

log = logging.getLogger(__name__)
RATE = 16000
RETRYABLE_HINT = (grpc.StatusCode.UNAVAILABLE, grpc.StatusCode.DEADLINE_EXCEEDED, grpc.StatusCode.INTERNAL)


class NvidiaASR:
    def __init__(self) -> None:
        self.model = os.getenv("NVIDIA_ASR_MODEL", "parakeet-1.1b-rnnt-multilingual-asr")
        # auto: try offline once, use streaming if the hosted endpoint does not offer it.
        self.mode = os.getenv("ASR_MODE", "auto")
        auth = riva.client.Auth(
            uri=os.getenv("NVIDIA_ASR_URI", "grpc.nvcf.nvidia.com:443"),
            use_ssl=True,
            metadata_args=[
                ["function-id", os.environ["NVIDIA_ASR_FUNCTION_ID"]],
                ["authorization", f"Bearer {os.environ['NVIDIA_API_KEY']}"],
            ],
        )
        self.svc = riva.client.ASRService(auth)

    def _config(self, language: str):
        return riva.client.RecognitionConfig(
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=RATE,
            audio_channel_count=1,
            language_code=language,
            max_alternatives=1,
            enable_automatic_punctuation=True,
        )

    def _offline(self, pcm: bytes, language: str):
        return list(self.svc.offline_recognize(pcm, self._config(language)).results)

    def _streaming(self, pcm: bytes, language: str):
        step = RATE * 2 // 10
        chunks = (pcm[i:i + step] for i in range(0, len(pcm), step))
        cfg = riva.client.StreamingRecognitionConfig(config=self._config(language), interim_results=False)
        return [r for resp in self.svc.streaming_response_generator(chunks, cfg) for r in resp.results if r.is_final]

    def _call(self, pcm: bytes, language: str):
        if self.mode == "streaming":
            return self._streaming(pcm, language)
        try:
            return self._offline(pcm, language)
        except grpc.RpcError as e:
            if self.mode == "auto" and e.code() in (grpc.StatusCode.UNIMPLEMENTED, grpc.StatusCode.INVALID_ARGUMENT):
                log.info("ASR offline mode rejected (%s), switching to streaming", e.code().name)
                self.mode = "streaming"
                return self._streaming(pcm, language)
            raise

    def transcribe(self, pcm: bytes, language: str) -> tuple[str, str | None]:
        last = None
        for attempt in range(3):
            try:
                results = self._call(pcm, language)
                if self.mode == "auto":
                    self.mode = "offline"
                text = " ".join(r.alternatives[0].transcript.strip() for r in results if r.alternatives).strip()
                detected = next((getattr(r, "language_code", "") for r in results if getattr(r, "language_code", "")), None)
                return text, detected or language
            except grpc.RpcError as e:
                last = f"{e.code().name}: {e.details()}"
                throttled = e.code() == grpc.StatusCode.RESOURCE_EXHAUSTED
                wait = (15 if throttled else 2) * 2 ** attempt
                log.warning("ASR attempt %d failed (%s), retrying in %ds", attempt + 1, e.code().name, wait)
                time.sleep(wait)
        raise ProviderError(f"Speech to text failed after 3 attempts. {last}")
