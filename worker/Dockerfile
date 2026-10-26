FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

# Bake pyannote weights at build time; no downloads at runtime.
# Needs a Hugging Face token that has accepted the pyannote/speaker-diarization-3.1 and segmentation-3.0 terms.
ENV HF_HOME=/models
ARG HF_TOKEN
RUN test -n "$HF_TOKEN" || (echo "Set HF_TOKEN as a Railway variable so it is passed as a build arg" && exit 1); \
    python -c "import os; from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token=os.environ['HF_TOKEN'])"
ENV HF_HUB_OFFLINE=1

COPY . .
CMD ["python", "main.py"]
