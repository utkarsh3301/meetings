# Meeting Notes: Tech Requirements

Version: V1 draft, 26 Oct 2026
Companion file: `system-architecture.html` (diagram and data flow)

## 1. Purpose

Internal web app for the QRYX team. Upload a recorded client meeting, get back:

- speaker-labelled, timestamped transcript synced to audio
- summary, decisions, action items, open questions
- scope-change flags against the project baseline
- commitment log (promises made by our side)

Volume: ~2 meetings/day, ~1.5 hrs each, ~66 hrs audio/month. Mixed Hindi and English (Hinglish) is the norm.

## 2. Hard constraints

1. **AI models: NVIDIA-published models on build.nvidia.com free endpoints only.** No OpenAI, AssemblyAI, Anthropic or other AI APIs.
2. **Hosting: Railway** for web app, Postgres and worker. **Cloudflare R2** for audio files only.
3. **No silent fallback.** If an NVIDIA call fails after retries, the job stops in `needs_attention`. Never reroute to another provider.
4. **Audio goes only to the ASR endpoint.** The LLM receives text only.
5. **Original transcript is never overwritten.** Edits are stored separately.
6. **Every extracted item cites its source segments.** No finding without evidence.
7. All AI calls go through a provider adapter so models can be swapped by config.

## 3. Models

### 3.1 Speech to text
- **Model:** `nvidia/parakeet-1.1b-rnnt-multilingual-asr`
- **Model page:** https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr
- **Protocol:** Riva gRPC, `grpc.nvcf.nvidia.com:443`, TLS
- **Auth metadata:** `authorization: Bearer $NVIDIA_API_KEY`, `function-id: $NVIDIA_ASR_FUNCTION_ID`
- **Function ID:** copy from the model's API tab on build.nvidia.com. Do not hardcode.
- **Client:** `nvidia-riva-client` (Python)
- **Audio in:** mono, 16-bit PCM, 16 kHz WAV (or FLAC)
- **Language:** configurable per meeting. Default `multi` (auto language ID). Also test `hi-IN` and `en-US`.
- **Mode:** use offline recognition if the hosted endpoint supports it, otherwise streaming recognition fed from file. Confirm in Phase 0.
- **Diarization:** test whether the hosted endpoint returns speaker tags. If yes, pyannote becomes optional (feature flag `DIARIZER=nvidia|pyannote`).

### 3.2 LLM
- **Model:** `nvidia/nemotron-3-super-120b-a12b`
- **Protocol:** OpenAI-compatible chat completions
- **Base URL:** `https://integrate.api.nvidia.com/v1`
- **Auth:** `Authorization: Bearer $NVIDIA_API_KEY`
- **Context:** 1M tokens. A full 1.5 hr transcript (~20-25k tokens) goes in one call. No chunking or map-reduce.
- **Reasoning:** off or low for summary extraction, on for scope-change detection.
- **Fallback model (config only, not automatic):** `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- **Output:** strict JSON, validated against schema in section 8. One retry on invalid JSON, then `needs_attention`.

### 3.3 Diarization (default)
- **Library:** `pyannote.audio`, pipeline `pyannote/speaker-diarization-3.1`
- Runs on CPU inside the worker. Not an external API.
- Needs a Hugging Face token once to download weights. Bake weights into the worker Docker image at build time; no runtime download.

### 3.4 Terms note
Free endpoints run under the NVIDIA API Trial Terms. Inputs may be collected and used by NVIDIA. Accepted by the team. Show a one-line notice on the upload screen.

## 4. Stack

| Layer | Choice |
|---|---|
| Web app | Next.js (App Router), TypeScript |
| ORM | Prisma |
| Auth | Auth.js, credentials (email + password, bcrypt). Admin creates users. No public signup. |
| UI | Tailwind CSS |
| DB | Railway Postgres |
| Audio storage | Cloudflare R2, private bucket, S3 API |
| Worker | Python 3.11, Docker, Railway cron service |
| Worker libs | `nvidia-riva-client`, `openai`, `pyannote.audio` (CPU torch), `psycopg[binary]`, `boto3`, `pydantic`, `ffmpeg` (system package) |
| Exports | `docx` (npm) for Word, browser print stylesheet or `@react-pdf/renderer` for PDF, plain markdown |

## 5. Repo structure

```
/web                Next.js app
  /app              routes and pages
  /components
  /lib              db, auth, r2, validation
  /prisma           schema.prisma, migrations
/worker             Python worker
  main.py           entry: claim jobs, run pipeline, exit
  pipeline/         preprocess.py, diarize.py, transcribe.py, analyse.py
  providers/        base.py, nvidia_asr.py, nvidia_llm.py
  prompts/          per meeting type templates
  schemas.py        pydantic models for LLM output
  Dockerfile
/scripts
  phase0_test.py    standalone ASR + diarization test on local files
/docs
  TECH_REQUIREMENTS.md
  system-architecture.html
```

## 6. Environment variables

| Name | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | web, worker | Railway Postgres |
| `AUTH_SECRET` | web | |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | web, worker | |
| `NVIDIA_API_KEY` | worker | never exposed to the browser |
| `NVIDIA_ASR_FUNCTION_ID` | worker | from model page |
| `NVIDIA_ASR_MODEL` | worker | default `parakeet-1.1b-rnnt-multilingual-asr` |
| `NVIDIA_LLM_MODEL` | worker | default `nvidia/nemotron-3-super-120b-a12b` |
| `NVIDIA_LLM_BASE_URL` | worker | default `https://integrate.api.nvidia.com/v1` |
| `DIARIZER` | worker | `pyannote` (default) or `nvidia` |
| `AUDIO_RETENTION_DAYS` | worker | default 30 |
| `MAX_UPLOAD_MB` | web | default 1024 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | web | creates the first admin on start when there are no users |
| `HF_TOKEN` | worker (build) | build arg, bakes pyannote weights into the image |
| `ASR_MODE` | worker | `auto` (default: try offline, else streaming), `offline`, `streaming` |
| `ASR_DELAY_SEC` | worker | pause between ASR calls, default 0.2 |
| `MAX_SEGMENT_SEC` | worker | longest segment sent to ASR, default 30 |

## 7. Data model

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @default(MEMBER)
  createdAt    DateTime @default(now())
}
enum Role { ADMIN MEMBER }

model Client {
  id         String    @id @default(cuid())
  name       String
  projects   Project[]
  vocabulary VocabTerm[]
}

model Project {
  id            String    @id @default(cuid())
  clientId      String
  name          String
  scopeBaseline String?   // free text or pasted SOW, used for scope-change check
  client        Client    @relation(fields: [clientId], references: [id])
  meetings      Meeting[]
}

model Meeting {
  id             String       @id @default(cuid())
  projectId      String
  title          String
  meetingDate    DateTime
  type           MeetingType
  languageHint   String       @default("multi")
  consentGiven   Boolean
  audioKey       String?      // R2 object key, null after retention delete
  durationSec    Int?
  status         JobStatus    @default(QUEUED)
  createdById    String
  createdAt      DateTime     @default(now())
  project        Project      @relation(fields: [projectId], references: [id])
  speakers       Speaker[]
  segments       Segment[]
  outputs        Output[]
  actionItems    ActionItem[]
  findings       Finding[]
  jobs           Job[]
}
enum MeetingType { DISCOVERY STATUS UAT INTERNAL OTHER }

model Speaker {
  id          String  @id @default(cuid())
  meetingId   String
  label       String  // SPEAKER_00 from diarizer
  displayName String?
  side        Side    @default(UNKNOWN)
  meeting     Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)
}
enum Side { CLIENT QRYX UNKNOWN }

model Segment {
  id         String   @id @default(cuid())
  meetingId  String
  speakerId  String?
  idx        Int      // order in meeting
  startMs    Int
  endMs      Int
  text       String   // raw ASR output, never edited
  editedText String?
  language   String?
  meeting    Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  @@index([meetingId, idx])
}

model Output {
  id        String     @id @default(cuid())
  meetingId String
  kind      OutputKind
  content   Json
  model     String
  createdAt DateTime   @default(now())
  meeting   Meeting    @relation(fields: [meetingId], references: [id], onDelete: Cascade)
}
enum OutputKind { SUMMARY DECISIONS OPEN_QUESTIONS }

model ActionItem {
  id         String       @id @default(cuid())
  meetingId  String
  text       String
  owner      String?
  side       Side         @default(UNKNOWN)
  dueDate    DateTime?
  status     ActionStatus @default(OPEN)
  segmentIds String[]
  meeting    Meeting      @relation(fields: [meetingId], references: [id], onDelete: Cascade)
}
enum ActionStatus { OPEN DONE DROPPED }

model Finding {
  id         String      @id @default(cuid())
  meetingId  String
  kind       FindingKind
  text       String
  detail     String?
  segmentIds String[]
  review     ReviewState @default(UNREVIEWED)
  meeting    Meeting     @relation(fields: [meetingId], references: [id], onDelete: Cascade)
}
enum FindingKind { SCOPE_CHANGE COMMITMENT }
enum ReviewState { UNREVIEWED CONFIRMED DISMISSED }

model VocabTerm {
  id       String @id @default(cuid())
  clientId String
  term     String
  client   Client @relation(fields: [clientId], references: [id])
}

model Job {
  id         String    @id @default(cuid())
  meetingId  String
  status     JobStatus @default(QUEUED)
  attempts   Int       @default(0)
  error      String?
  startedAt  DateTime?
  finishedAt DateTime?
  timings    Json?     // seconds per stage
  meeting    Meeting   @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  @@index([status])
}
enum JobStatus { QUEUED PREPROCESSING DIARIZING TRANSCRIBING ANALYSING READY NEEDS_ATTENTION FAILED }
```

Full-text search: add a raw SQL migration with a generated `tsvector` column on `Segment` using the `simple` config (Hindi and English mixed, so no language stemming) and a GIN index.

## 8. LLM output schema

One call per meeting returns:

```json
{
  "summary": "string, 150-300 words",
  "decisions": [{"text": "string", "segment_ids": ["string"]}],
  "action_items": [{"text": "string", "owner": "string|null", "side": "CLIENT|QRYX|UNKNOWN", "due": "YYYY-MM-DD|null", "segment_ids": ["string"]}],
  "open_questions": [{"text": "string", "segment_ids": ["string"]}],
  "commitments": [{"text": "string", "by": "string|null", "due": "YYYY-MM-DD|null", "segment_ids": ["string"]}]
}
```

Scope-change is a second call, only when the project has a `scopeBaseline`, reasoning on:

```json
{
  "scope_changes": [{"request": "string", "why_outside_scope": "string", "segment_ids": ["string"]}]
}
```

Rules for both:
- Transcript is passed as lines: `[segment_id] [mm:ss] Speaker Name (side): text`
- Prompt includes client vocabulary list and meeting type.
- Output in English even if transcript is Hindi or mixed.
- Any `segment_id` not present in the input is dropped by validation.
- Commitments are only things said by QRYX-side speakers.
- Scope changes are flags for review. Never auto-actioned.

## 9. Worker pipeline

Runs as Railway cron, every 10 minutes. Processes jobs until queue is empty, then exits.

1. **Claim:** `SELECT ... FROM "Job" WHERE status='QUEUED' ORDER BY created ... FOR UPDATE SKIP LOCKED LIMIT 1`. Also re-claim jobs stuck in a running state for more than 2 hrs.
2. **Preprocess:** download from R2, `ffmpeg -i in -ac 1 -ar 16000 -sample_fmt s16 -af loudnorm out.wav`. If source was video, upload an `.m4a` back to R2 and delete the video. Store duration.
3. **Diarize:** pyannote on the wav. Merge turns under 1 s into neighbours. Split turns over 30 s at the nearest silence. Insert `Speaker` and `Segment` rows with empty text.
4. **Transcribe:** for each segment, cut audio, send to Parakeet with the meeting's language hint. Write `text` and `language`. Retry each call 3 times with backoff. If any segment still fails, job goes to `NEEDS_ATTENTION` with the error; completed segments are kept and resume skips them.
5. **Analyse:** build transcript lines, call Nemotron, validate with pydantic, write `Output`, `ActionItem`, `Finding` rows. Then scope-change call if baseline exists.
6. **Finish:** set `READY`, record timings, delete temp files.
7. **Retention:** at end of each run, delete R2 audio older than `AUDIO_RETENTION_DAYS` and null `audioKey`.

Each stage commits before the next starts. A rerun resumes from the first incomplete stage.

## 10. Features and acceptance criteria

### F1. Auth
- Email + password login. Admin can create, deactivate users and reset passwords.
- All routes except login require a session.

### F2. Clients and projects
- CRUD for clients and projects. Project has an optional scope baseline text field.
- Client has a vocabulary list (names, products, module names).

### F3. Upload
- Fields: client, project, title, date, meeting type, language hint (default auto), consent checkbox (required).
- Accepts mp3, m4a, wav, mp4, webm. Max size from `MAX_UPLOAD_MB`.
- Browser uploads directly to R2 via presigned PUT URL. Server never streams the file.
- Upload progress shown as a progress bar.
- On complete, meeting and job rows created with `QUEUED`.
- One-line notice: audio is processed via NVIDIA hosted models.

### F4. Meeting list
- Table: title, client, project, date, type, duration, status.
- Filter by client, project, type, status. Sort by date.
- Status shown as static text labels. No animated or pulsing badges.

### F5. Meeting detail
- Audio player at top (presigned GET URL, short expiry).
- Transcript: one block per segment with speaker name, timestamp, text.
- Click a segment to seek audio. Current segment highlighted during playback.
- Tabs or sections: Summary, Decisions, Action items, Open questions, Commitments, Scope flags.
- Every item shows its source timestamps; clicking jumps to that segment.

### F6. Speaker management
- Rename each speaker label, set side (client / QRYX).
- Rename applies everywhere in the meeting immediately.
- "Re-run analysis" button after renaming, so owners and commitments use real names.

### F7. Transcript editing
- Inline edit a segment. Saves to `editedText`. Show an edited marker.
- Toggle to view original.

### F8. Action items
- Edit text, owner, due date, status.
- Global action items page across all meetings, filterable by client, owner, status.

### F9. Findings review
- Scope flags and commitments have Confirm / Dismiss.
- Global page listing unreviewed findings per project.

### F10. Search
- Search box across all transcripts. Results show meeting, timestamp, snippet; click opens the meeting at that segment.
- Filter by client and project.

### F11. Export
- Per meeting: markdown, docx, PDF.
- Options: transcript only, summary only, both.
- Uses edited text and renamed speakers.

### F12. Re-processing
- Admin can re-run a failed or `NEEDS_ATTENTION` job from the meeting page.
- Admin can re-run only the analysis stage.

### F13. Job visibility
- Meeting page shows current stage and, on failure, the error message in plain words.
- Admin page lists recent jobs with stage timings.

### F14. Delete
- Admin can delete a meeting: removes rows and R2 audio. Confirmation required.

## 11. API routes (web)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/uploads/presign` | return presigned PUT URL + object key |
| POST | `/api/meetings` | create meeting + job after upload |
| GET | `/api/meetings` | list with filters |
| GET | `/api/meetings/:id` | meeting with segments, speakers, outputs |
| PATCH | `/api/meetings/:id/speakers/:speakerId` | rename, set side |
| PATCH | `/api/segments/:id` | save edited text |
| PATCH | `/api/action-items/:id` | update |
| PATCH | `/api/findings/:id` | confirm or dismiss |
| POST | `/api/meetings/:id/rerun` | body `{stage: "all" or "analysis"}`, admin |
| GET | `/api/meetings/:id/audio` | presigned GET URL |
| GET | `/api/meetings/:id/export?format=md|docx|pdf&part=...` | file download |
| GET | `/api/search?q=&clientId=&projectId=` | full-text search |
| DELETE | `/api/meetings/:id` | admin |
| CRUD | `/api/clients`, `/api/projects`, `/api/users`, `/api/vocab` | admin |

Validate all inputs with zod. Check role on admin routes server-side.

## 12. Non-functional

- **Security:** NVIDIA key and R2 keys only on server/worker. R2 bucket private, no public access. Presigned URLs expire in 15 min.
- **Retention:** audio deleted after `AUDIO_RETENTION_DAYS`. Text kept until meeting deleted.
- **Turnaround target:** under 45 min per 1.5 hr meeting after the worker picks it up.
- **Cost guardrail:** set a Railway usage limit. Worker must exit when idle, never stay resident.
- **Logging:** worker logs stage start, end, duration and errors per job. No transcript text in logs.
- **Rate limits:** worker sends ASR calls sequentially with a small delay, configurable. Back off on 429.

## 13. Conventions (apply to all code, UI copy and commits)

- No em dashes anywhere: code, comments, UI text, docs, commit messages.
- No emojis anywhere.
- No flickering, pulsing or animated status pills or badges. Status is static text.
- Plain, terse UI copy.

## 14. Build phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | `scripts/phase0_test.py`: ffmpeg + pyannote + Parakeet on 4-5 real recordings, languages `multi`, `hi-IN`, `en-US`. Check hosted diarization. Call Nemotron with the schema in section 8. | Team reads outputs and agrees accuracy is usable. Language default and diarizer chosen. |
| 1 | Prisma schema, auth, clients/projects, upload to R2, meeting + job creation | Can upload and see a queued meeting |
| 2 | Worker: preprocess, diarize, transcribe, write segments; Railway cron | Uploaded meeting reaches transcript stage end to end |
| 3 | Meeting detail: audio sync, speaker rename, edit, search | F5, F6, F7, F10 pass |
| 4 | Analysis: Nemotron call, outputs, action items, findings, review pages | F8, F9 pass |
| 5 | Export, re-run, admin, job visibility, retention, delete | F11 to F14 pass |

Phase 0 is a gate. If Hinglish accuracy is not usable, stop and revisit the model choice before Phase 1.

## 15. Out of scope for V1

- Live transcription or a bot that joins Meet/Zoom
- Ask-this-meeting chat and cross-meeting Q&A
- Embeddings and semantic search
- Pushing action items into other tools
- Mobile layout beyond basic responsiveness

## 16. Open items

- Confirm `NVIDIA_ASR_FUNCTION_ID` and whether the hosted Parakeet endpoint supports offline recognition and speaker tags.
- Confirm max audio length per ASR request; adjust the 30 s split if needed.
- Agree `AUDIO_RETENTION_DAYS`.
- Write summary prompt templates per meeting type (discovery, status, UAT, internal, other).
