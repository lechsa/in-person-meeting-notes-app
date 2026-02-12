# Software Design Document (SDD)

## In-Person Meeting Notes App

**Version:** 1.0  
**Date:** February 10, 2026  
**Status:** Draft  
**Based on:** PRD v1.0

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Architecture Design](#3-architecture-design)
4. [Mobile App Design](#4-mobile-app-design)
5. [Backend Design](#5-backend-design)
6. [Database Design](#6-database-design)
7. [Native Configuration Plugin](#7-native-configuration-plugin)
8. [Audio Recording System](#8-audio-recording-system)
9. [Notification & Deep Linking System](#9-notification--deep-linking-system)
10. [Authentication & Security](#10-authentication--security)
11. [Error Handling & Resilience](#11-error-handling--resilience)
12. [API Contracts](#12-api-contracts)
13. [Sequence Diagrams](#13-sequence-diagrams)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)

---

## 1. Introduction

### 1.1 Purpose

This document describes the technical design for the In-Person Meeting Notes App — a mobile application that records in-person meetings in the background, uploads audio for processing, and delivers AI-generated transcripts and summaries via push notifications.

### 1.2 Scope

This SDD covers the V1 implementation including the mobile app (iOS/Android), custom Expo config plugin, Python backend, and Supabase integration. Future enhancements are explicitly out of scope.

### 1.3 References

- PRD v1.0 — In-Person Meeting Notes App
- [Expo SDK 54 Documentation](https://docs.expo.dev)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Supabase Documentation](https://supabase.com/docs)

---

## 2. System Overview

The system consists of three primary components:

1. **Mobile App** — React Native (Expo SDK 54) with background audio recording, file-based routing, and push notification handling
2. **Python Backend** — FastAPI service that processes audio into transcripts and summaries
3. **Supabase Platform** — Provides authentication, Postgres database with RLS, and file storage

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   Mobile App   │────▶│    Supabase    │◀────│ Python Backend │
│  (Expo SDK 54) │     │ (Auth/DB/Store)│     │   (FastAPI)    │
└────────────────┘     └────────────────┘     └────────────────┘
        │                                            │
        │              ┌────────────────┐            │
        └─────────────▶│  Expo Push     │◀───────────┘
                       │  Service       │
                       └────────────────┘
```

---

## 3. Architecture Design

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                               │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │ Presentation│  │  Services   │  │   Native Modules       │  │
│  │   Layer     │  │   Layer     │  │                        │  │
│  │             │  │             │  │  ┌──────────────────┐  │  │
│  │ - Screens   │  │ - AudioSvc  │  │  │ Config Plugin    │  │  │
│  │ - Components│  │ - UploadSvc │  │  │ (Background Audio│  │  │
│  │ - Hooks     │  │ - MeetingSvc│  │  │  Permissions)    │  │  │
│  │             │  │ - AuthSvc   │  │  └──────────────────┘  │  │
│  │             │  │ - NotifSvc  │  │                        │  │
│  └─────────────┘  └─────────────┘  └────────────────────────┘  │
│         │                │                                      │
│         └────────┬───────┘                                      │
│                  ▼                                               │
│         ┌─────────────┐                                         │
│         │ Supabase    │                                         │
│         │ Client SDK  │                                         │
│         └──────┬──────┘                                         │
└────────────────┼────────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐          ┌─────────────────────┐
        │    Supabase     │          │   Python Backend    │
        │                 │          │                     │
        │  ┌───────────┐  │  HTTP    │  ┌───────────────┐  │
        │  │  Auth     │  │◀────────▶│  │  FastAPI App  │  │
        │  ├───────────┤  │          │  ├───────────────┤  │
        │  │  Postgres │  │          │  │  Transcriber  │  │
        │  │  + RLS    │  │          │  ├───────────────┤  │
        │  ├───────────┤  │          │  │  Summarizer   │  │
        │  │  Storage  │  │          │  ├───────────────┤  │
        │  └───────────┘  │          │  │  Notifier     │  │
        └─────────────────┘          │  └───────────────┘  │
                                     └─────────────────────┘
```

### 3.2 Design Principles

- **Separation of Concerns** — Each layer has a single responsibility; screens don't contain business logic
- **Service Abstraction** — All external interactions (audio, storage, DB, notifications) are encapsulated in service modules
- **Offline Resilience** — Recording is local-first; upload happens post-recording with retry logic
- **Fail Gracefully** — Audio interruptions, network failures, and processing errors are handled without data loss

### 3.3 Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State Management | React Context + hooks | Lightweight; sufficient for app complexity; avoids external dependencies |
| Audio Recording | `expo-audio` | First-party Expo support; background audio capabilities |
| Transcription | OpenAI Whisper-1 (`v1/audio/transcriptions`) | General-purpose speech recognition; supports 50+ languages; 25 MB file upload limit; $0.006/min pricing |
| Summarization | sumy (Luhn algorithm) | Lightweight extractive summarization; no LLM API cost; runs locally |
| File Storage | Supabase Storage | Unified platform with auth + DB; signed URL support |
| Push Notifications | `expo-notifications` | Native Expo integration; handles token registration and deep links |
| HTTP Client | `fetch` (mobile) / `httpx` (backend) | Native fetch for mobile simplicity; httpx for async Python |

---

## 4. Mobile App Design

### 4.1 Project Structure

```
/
├── app/
│   ├── _layout.tsx                 # Root layout (auth guard, notification listener)
│   ├── (tabs)/
│   │   ├── _layout.tsx             # Tab navigator configuration
│   │   ├── index.tsx               # Home screen — record button + status
│   │   └── meetings.tsx            # Meeting list screen
│   └── meeting/
│       └── [id].tsx                # Meeting detail — transcript + summary
│
├── components/
│   ├── RecordButton.tsx            # Animated record/stop button
│   ├── MeetingCard.tsx             # Meeting list item
│   ├── TranscriptView.tsx          # Transcript display component
│   └── StatusBadge.tsx             # Processing status indicator
│
├── services/
│   ├── audio.ts                    # Audio recording lifecycle
│   ├── upload.ts                   # File upload to Supabase Storage
│   ├── meetings.ts                 # CRUD operations on meetings table
│   ├── auth.ts                     # Authentication flows
│   ├── notifications.ts           # Push token registration + handlers
│   └── processing.ts              # Trigger backend processing
│
├── hooks/
│   ├── useRecording.ts             # Recording state + controls hook
│   ├── useMeetings.ts              # Meetings data fetching hook
│   └── useNotifications.ts         # Notification listener hook
│
├── lib/
│   ├── supabase.ts                 # Supabase client initialization
│   └── constants.ts                # App-wide constants
│
├── types/
│   └── index.ts                    # TypeScript type definitions
│
├── plugins/
│   └── withBackgroundAudio/
│       ├── index.ts                # Plugin entry point
│       ├── withBackgroundAudioIOS.ts   # iOS modifications
│       └── withBackgroundAudioAndroid.ts # Android modifications
│
├── app.json                        # Expo configuration
├── tsconfig.json
└── package.json
```

### 4.2 Screen Designs

#### 4.2.1 Home Screen (`app/(tabs)/index.tsx`)

**Responsibilities:**
- Display large, prominent record/stop button
- Show real-time recording duration when active
- Show recording state indicator (idle / recording / uploading)
- Trigger upload + processing on stop

**State:**
```typescript
interface RecordingState {
  isRecording: boolean;
  duration: number;          // seconds elapsed
  recordingUri: string | null;
  status: 'idle' | 'recording' | 'uploading' | 'processing';
}
```

**Behavior:**
- On **Record tap**: Request mic permission (if needed) → Create meeting record (status: `recording`) → Start `expo-audio` recording → Start duration timer
- On **Stop tap**: Stop recording → Set status `uploading` → Upload file to Supabase Storage → Call backend `/process-meeting` → Set status `processing`
- Recording persists across background/lock via config plugin

#### 4.2.2 Meetings List (`app/(tabs)/meetings.tsx`)

**Responsibilities:**
- Fetch and display user's meetings sorted by `created_at` desc
- Show meeting date, duration, and status badge per item
- Pull-to-refresh support
- Navigate to meeting detail on tap

**Data fetching:**
```typescript
const { data: meetings } = await supabase
  .from('meetings')
  .select('*')
  .order('created_at', { ascending: false });
```

#### 4.2.3 Meeting Detail (`app/meeting/[id].tsx`)

**Responsibilities:**
- Receive `id` from route params (including deep links)
- Fetch single meeting by ID
- Display transcript and summary in scrollable view
- Show loading/processing state if not yet complete
- Handle case where meeting is not found or not owned by user

### 4.3 Service Layer Design

#### 4.3.1 Audio Service (`services/audio.ts`)

```typescript
// Core interface
interface AudioService {
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ uri: string; duration: number }>;
  configureAudioSession(): Promise<void>;
}
```

**Implementation details:**
- Uses `expo-audio` recording API (`setAudioModeAsync`, `RecordingPresets`)
- Configures `setAudioModeAsync()` for background recording:
  ```typescript
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    allowsBackgroundRecording: true,
  });
  ```
- Recording preset: `RecordingPresets.HIGH_QUALITY` (M4A/AAC)
- Registers interruption handler to pause/resume gracefully

#### 4.3.2 Upload Service (`services/upload.ts`)

```typescript
interface UploadService {
  uploadAudio(fileUri: string, meetingId: string): Promise<string>; // returns public URL
}
```

**Implementation details:**
- Reads file from local filesystem using `expo-file-system`
- Uploads to Supabase Storage bucket `meeting-audio` with path `{user_id}/{meeting_id}.m4a`
- Returns signed URL for backend access
- Implements retry with exponential backoff (max 3 attempts)

#### 4.3.3 Meetings Service (`services/meetings.ts`)

```typescript
interface MeetingsService {
  create(duration?: number): Promise<Meeting>;
  getAll(): Promise<Meeting[]>;
  getById(id: string): Promise<Meeting | null>;
  updateStatus(id: string, status: MeetingStatus): Promise<void>;
}
```

#### 4.3.4 Notifications Service (`services/notifications.ts`)

```typescript
interface NotificationService {
  registerForPushNotifications(): Promise<string>;  // returns push token
  setupNotificationHandler(): void;
  setupResponseHandler(): void;                     // handles notification taps
}
```

**Implementation details:**
- Uses `expo-notifications` for token registration and listeners
- `NotificationResponseReceivedListener` extracts `meeting_id` from notification data
- Routes to `/meeting/[id]` via Expo Router `router.push()`

### 4.4 Routing & Deep Linking

**Expo Router file-based routes:**

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/(tabs)/index.tsx` | Home / recording |
| `/meetings` | `app/(tabs)/meetings.tsx` | Meetings list |
| `/meeting/:id` | `app/meeting/[id].tsx` | Meeting detail |

**Deep link configuration (app.json):**
```json
{
  "expo": {
    "scheme": "meetingnotes",
    "plugins": ["./plugins/withBackgroundAudio"]
  }
}
```

**Deep link URL format:**
```
meetingnotes:///meeting/{meeting_id}
```

**Notification payload structure:**
```json
{
  "to": "ExponentPushToken[xxx]",
  "title": "Meeting Ready",
  "body": "Your transcript and summary are ready.",
  "data": {
    "meetingId": "uuid-here",
    "url": "/meeting/uuid-here"
  }
}
```

---

## 5. Backend Design

### 5.1 Project Structure

```
/backend
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app entry point
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py           # API route definitions
│   ├── services/
│   │   ├── __init__.py
│   │   ├── transcriber.py      # Audio → transcript
│   │   ├── summarizer.py       # Transcript → summary
│   │   ├── storage.py          # Download audio from Supabase
│   │   ├── database.py         # Update meeting records
│   │   └── notifier.py         # Send Expo push notifications
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py          # Pydantic request/response models
│   └── config.py               # Environment configuration
├── requirements.txt
├── Dockerfile
└── .env.example
```

**Key dependencies (`requirements.txt`):**
```
fastapi
uvicorn[standard]
httpx
openai
pydub
python-dotenv
supabase
```

### 5.2 Application Entry Point

```python
# main.py
from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(title="Meeting Notes API", version="1.0.0")
app.include_router(router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### 5.3 Service Layer

#### 5.3.1 Transcriber (`services/transcriber.py`)

Uses [OpenAI Whisper-1](https://platform.openai.com/docs/models/whisper-1) for speech-to-text transcription.

```python
import os
import math
from openai import OpenAI
from pydub import AudioSegment

class TranscriberService:
    # Whisper-1 file upload limit
    MAX_FILE_SIZE_MB = 25
    # Supported input formats: mp3, mp4, mpeg, mpga, m4a, wav, webm
    SUPPORTED_FORMATS = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"}

    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    async def transcribe(self, audio_path: str) -> str:
        """
        Transcribe audio file to text using OpenAI Whisper-1.

        - Files ≤ 25 MB: Single API call
        - Files > 25 MB: Split into chunks, transcribe each, concatenate

        Returns the full transcript as a string.
        """
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)

        if file_size_mb <= self.MAX_FILE_SIZE_MB:
            return await self._transcribe_single(audio_path)
        else:
            return await self._transcribe_chunked(audio_path)

    async def _transcribe_single(self, audio_path: str) -> str:
        """Transcribe a single audio file (≤ 25 MB)."""
        with open(audio_path, "rb") as audio_file:
            response = self.client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        return response.text

    async def _transcribe_chunked(self, audio_path: str) -> str:
        """
        Split audio into ≤ 25 MB chunks and transcribe sequentially.
        Uses the previous chunk's transcript as a prompt for continuity.
        """
        audio = AudioSegment.from_file(audio_path)
        duration_ms = len(audio)
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)

        # Calculate chunk duration to stay under 25 MB
        num_chunks = math.ceil(file_size_mb / self.MAX_FILE_SIZE_MB)
        chunk_duration_ms = duration_ms // num_chunks

        transcripts = []
        previous_text = ""

        for i in range(num_chunks):
            start = i * chunk_duration_ms
            end = min((i + 1) * chunk_duration_ms, duration_ms)
            chunk = audio[start:end]

            chunk_path = f"/tmp/chunk_{i}.m4a"
            chunk.export(chunk_path, format="ipod")  # ipod = m4a

            with open(chunk_path, "rb") as chunk_file:
                response = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=chunk_file,
                    response_format="text",
                    prompt=previous_text[-224:] if previous_text else None,
                )

            transcripts.append(response)
            previous_text = response
            os.remove(chunk_path)

        return " ".join(transcripts)
```

**Key design details:**

| Aspect | Detail |
|--------|--------|
| **Model** | `whisper-1` via `POST /v1/audio/transcriptions` |
| **Input formats** | `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm` |
| **File size limit** | 25 MB per request |
| **Chunking strategy** | Files > 25 MB are split using PyDub; each chunk's transcript is prompted with the tail of the previous chunk (max 224 tokens) to maintain sentence continuity |
| **Response format** | `verbose_json` for single files (includes segment timestamps); `text` for chunks |
| **Pricing** | $0.006 per minute of audio |
| **Language support** | 50+ languages auto-detected; no language parameter needed |

#### 5.3.2 Summarizer (`services/summarizer.py`)

Uses [sumy](https://github.com/miso-belica/sumy) with the **Luhn extractive summarization** algorithm for lightweight, offline-capable summarization without LLM API costs.

```python
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.luhn import LuhnSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words

class SummarizerService:
    LANGUAGE = "english"
    MAX_SUMMARY_WORDS = 200

    def __init__(self):
        stemmer = Stemmer(self.LANGUAGE)
        self.summarizer = LuhnSummarizer(stemmer)
        self.summarizer.stop_words = get_stop_words(self.LANGUAGE)

    async def summarize(self, transcript: str) -> str:
        """
        Generate an extractive summary from a transcript using Luhn algorithm.
        - Transcripts < 50 words: returns first 3 sentences
        - Longer transcripts: extracts key sentences (1 per 100 words, clamped 3–30)
        - Result trimmed to max 200 words at sentence boundaries
        """
        word_count = len(transcript.split())
        if word_count < 50:
            return self._first_sentences(transcript, 3)

        parser = PlaintextParser.from_string(transcript, Tokenizer(self.LANGUAGE))
        sentence_count = max(3, min(30, word_count // 100))
        sentences = self.summarizer(parser.document, sentence_count)
        summary = " ".join(str(s) for s in sentences)
        return self._trim_to_max_words(summary, self.MAX_SUMMARY_WORDS)
```

**Key design details:**

| Aspect | Detail |
|--------|--------|
| **Algorithm** | Luhn extractive summarization (frequency-based sentence scoring) |
| **Library** | `sumy` with NLTK tokenizer |
| **No API cost** | Runs locally — no LLM API calls needed for summarization |
| **Scaling** | 1 extracted sentence per 100 words of transcript (min 3, max 30) |
| **Output limit** | Trimmed to 200 words at sentence boundaries |
| **Fallback** | Returns first 3 sentences for short transcripts or on error |

#### 5.3.3 Storage Service (`services/storage.py`)

```python
class StorageService:
    def __init__(self, supabase_url: str, supabase_key: str):
        self.client = create_client(supabase_url, supabase_key)

    async def download_audio(self, audio_url: str) -> str:
        """Download audio from Supabase Storage to local temp file."""
        # Download via signed URL
        # Save to /tmp/{uuid}.m4a
        # Return local file path
```

#### 5.3.4 Database Service (`services/database.py`)

```python
class DatabaseService:
    async def update_meeting(
        self,
        meeting_id: str,
        transcript: str,
        summary: str,
        status: str = "completed"
    ) -> None:
        """Update meeting record with transcript, summary, and status."""
        await self.client.table('meetings').update({
            'transcript': transcript,
            'summary': summary,
            'status': status,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', meeting_id).execute()
```

#### 5.3.5 Notifier (`services/notifier.py`)

```python
class NotifierService:
    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

    async def send_notification(
        self,
        push_token: str,
        meeting_id: str
    ) -> None:
        """Send Expo push notification with deep link data."""
        payload = {
            "to": push_token,
            "title": "Meeting Ready",
            "body": "Your transcript and summary are ready.",
            "data": {
                "meetingId": meeting_id,
                "url": f"/meeting/{meeting_id}"
            },
            "sound": "default",
            "priority": "high"
        }
        async with httpx.AsyncClient() as client:
            await client.post(self.EXPO_PUSH_URL, json=payload)
```

### 5.4 Processing Pipeline

The `/process-meeting` endpoint orchestrates five sequential steps:

```
1. Download audio    → StorageService.download_audio()
2. Transcribe        → TranscriberService.transcribe() → OpenAI Whisper-1 API
3. Summarize         → SummarizerService.summarize()
4. Update database   → DatabaseService.update_meeting()
5. Send notification → NotifierService.send_notification()
```

Each step is wrapped in error handling. If any step fails, the meeting status is set to `failed` and the error is logged.

---

## 6. Database Design

### 6.1 Schema

#### `meetings` Table

```sql
CREATE TABLE meetings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    audio_url   TEXT,
    transcript  TEXT,
    summary     TEXT,
    status      TEXT NOT NULL DEFAULT 'recording'
                CHECK (status IN ('recording', 'uploading', 'processing', 'completed', 'failed')),
    duration    INTEGER,        -- seconds
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user's meetings list query
CREATE INDEX idx_meetings_user_id_created ON meetings(user_id, created_at DESC);
```

### 6.2 Row-Level Security Policies

```sql
-- Enable RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Users can read only their own meetings
CREATE POLICY "Users can view own meetings"
    ON meetings FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own meetings
CREATE POLICY "Users can create own meetings"
    ON meetings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own meetings
CREATE POLICY "Users can update own meetings"
    ON meetings FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can update any meeting (for backend processing)
CREATE POLICY "Service role can update meetings"
    ON meetings FOR UPDATE
    USING (auth.role() = 'service_role');
```

### 6.3 Storage Bucket

```sql
-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-audio', 'meeting-audio', false);

-- Users can upload to their own folder
CREATE POLICY "Users can upload own audio"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'meeting-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can read their own audio
CREATE POLICY "Users can read own audio"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'meeting-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
```

### 6.4 State Machine

Meeting records follow a strict state progression:

```
recording → uploading → processing → completed
                                   → failed
```

| State | Set By | Description |
|-------|--------|-------------|
| `recording` | Mobile app | Created when user starts recording |
| `uploading` | Mobile app | Audio file being uploaded to Storage |
| `processing` | Mobile app | Backend processing triggered |
| `completed` | Backend | Transcript + summary saved to DB |
| `failed` | Backend | Error during processing pipeline |

---

## 7. Native Configuration Plugin

### 7.1 Plugin Architecture

The config plugin modifies native project files at prebuild time. It is structured as a modular Expo config plugin with platform-specific handlers.

```
plugins/withBackgroundAudio/
├── index.ts                        # Plugin entry, composes iOS + Android
├── withBackgroundAudioIOS.ts       # iOS Info.plist + entitlements
└── withBackgroundAudioAndroid.ts   # Android manifest + permissions
```

### 7.2 Plugin Entry Point

```typescript
// plugins/withBackgroundAudio/index.ts
import { ConfigPlugin } from 'expo/config-plugins';
import { withBackgroundAudioIOS } from './withBackgroundAudioIOS';
import { withBackgroundAudioAndroid } from './withBackgroundAudioAndroid';

const withBackgroundAudio: ConfigPlugin = (config) => {
  config = withBackgroundAudioIOS(config);
  config = withBackgroundAudioAndroid(config);
  return config;
};

export default withBackgroundAudio;
```

### 7.3 iOS Configuration

**File modified:** `Info.plist`

```typescript
// withBackgroundAudioIOS.ts
import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

export const withBackgroundAudioIOS: ConfigPlugin = (config) => {
  return withInfoPlist(config, (config) => {
    // Enable background audio mode
    const modes = config.modResults.UIBackgroundModes ?? [];
    if (!modes.includes('audio')) {
      modes.push('audio');
    }
    config.modResults.UIBackgroundModes = modes;

    // Microphone usage description
    config.modResults.NSMicrophoneUsageDescription =
      'This app needs microphone access to record meeting audio.';

    return config;
  });
};
```

**What this enables:**
- `UIBackgroundModes: ['audio']` — Allows audio recording/playback to continue when the app is backgrounded
- `NSMicrophoneUsageDescription` — Required permission string shown to user on first microphone access

**Audio session configuration** (handled at runtime in audio service):
```typescript
// Category set at recording start time
await setAudioModeAsync({
  allowsRecording: true,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsBackgroundRecording: true,
});
```

### 7.4 Android Configuration

**Files modified:** `AndroidManifest.xml`

```typescript
// withBackgroundAudioAndroid.ts
import { ConfigPlugin, withAndroidManifest } from 'expo/config-plugins';

export const withBackgroundAudioAndroid: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add permissions
    const permissions = [
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ];

    permissions.forEach((permission) => {
      if (!manifest['uses-permission']?.some(
        (p) => p.$['android:name'] === permission
      )) {
        manifest['uses-permission'] = manifest['uses-permission'] || [];
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add foreground service with microphone type
    const application = manifest.application?.[0];
    if (application) {
      application.service = application.service || [];
      application.service.push({
        $: {
          'android:name': '.AudioRecordingService',
          'android:foregroundServiceType': 'microphone',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
};
```

**What this enables:**
- `RECORD_AUDIO` — Runtime permission for microphone access
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE` — Allows a foreground service to use the microphone
- Service declaration with `foregroundServiceType: microphone` — Keeps recording alive in background with a persistent notification

---

## 8. Audio Recording System

### 8.1 Recording Lifecycle

```
┌──────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│   IDLE   │────▶│ RECORDING │────▶│ STOPPING │────▶│ UPLOADING│
│          │ tap │           │ tap │          │     │          │
└──────────┘     └─────┬─────┘     └──────────┘     └────┬─────┘
                       │                                  │
                  ┌────▼────┐                        ┌────▼─────┐
                  │INTERRUPT│                        │PROCESSING│
                  │ (pause) │                        │          │
                  └────┬────┘                        └──────────┘
                       │
                  ┌────▼────┐
                  │ RESUME  │
                  └─────────┘
```

### 8.2 Recording Configuration

```typescript
import { RecordingPresets, type RecordingOptions } from 'expo-audio';

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  extension: '.m4a',
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    outputFormat: 'aac',
    audioQuality: 96,
  },
};
```

**Format rationale:** M4A (AAC) provides good compression with high quality, keeping file sizes reasonable for upload (~1 MB/min at 128kbps mono). Single channel (mono) is sufficient for meeting voice capture.

### 8.3 Background Recording Behavior

**iOS:**
- `UIBackgroundModes: audio` allows the audio session to remain active
- `shouldPlayInBackground: true` + `allowsBackgroundRecording: true` on the audio session prevents iOS from suspending the recording
- The system may still interrupt for phone calls — the app handles `AVAudioSession` interruption notifications to pause/resume

**Android:**
- A foreground service with type `microphone` keeps the process alive
- A persistent notification is displayed while recording (required by Android)
- `FOREGROUND_SERVICE_MICROPHONE` permission (Android 14+) explicitly allows mic use in foreground service

### 8.4 Interruption Handling

Audio interruptions (phone calls, alarms, etc.) are handled by the `expo-audio` runtime. The audio session configuration with `allowsBackgroundRecording: true` ensures recording resumes automatically after transient interruptions.

---

## 9. Notification & Deep Linking System

### 9.1 Push Token Registration Flow

```
App Launch
    │
    ▼
Check notification permissions
    │
    ├── Not granted → Request permission
    │                     │
    │                     ├── Granted → Continue
    │                     └── Denied  → Skip (degrade gracefully)
    │
    ▼
Get Expo Push Token
    │
    ▼
Store token locally (for use when triggering processing)
```

### 9.2 Notification Handling

```typescript
// Root layout (_layout.tsx) — runs on app mount
useEffect(() => {
  // Handle notification received while app is foregrounded
  const foregroundSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      // Optionally show in-app banner
    }
  );

  // Handle notification tap (app foregrounded, backgrounded, or killed)
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const { meetingId } = response.notification.request.content.data;
      if (meetingId) {
        router.push(`/meeting/${meetingId}`);
      }
    }
  );

  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}, []);
```

### 9.3 Deep Link Resolution

| App State | Behavior |
|-----------|----------|
| **Foreground** | `NotificationResponseReceivedListener` fires → `router.push()` |
| **Background** | App brought to foreground → listener fires → navigate |
| **Killed** | App cold-starts → Expo Router resolves initial URL from notification → renders `meeting/[id]` |

**Cold-start handling** via `Notifications.getLastNotificationResponseAsync()`:
```typescript
// In root layout, check for initial notification
const lastResponse = await Notifications.getLastNotificationResponseAsync();
if (lastResponse) {
  const { meetingId } = lastResponse.notification.request.content.data;
  router.replace(`/meeting/${meetingId}`);
}
```

---

## 10. Authentication & Security

### 10.1 Auth Flow

```
App Launch
    │
    ▼
Check Supabase session
    │
    ├── Valid session → Show app (tabs)
    │
    └── No session → Show login screen
                        │
                        ▼
                  Email/password sign-in or sign-up
                        │
                        ▼
                  Session stored by Supabase client
                        │
                        ▼
                  Navigate to app (tabs)
```

### 10.2 Security Model

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| **Client → Supabase** | Supabase `anon` key + JWT | Authenticated requests only |
| **Database** | Row-Level Security | Users access only their own meetings |
| **Storage** | RLS on `storage.objects` | Users upload/read only in their `user_id` folder |
| **Backend → Supabase** | `service_role` key | Backend can update any meeting (server-side only) |
| **Backend API** | Request validation | Pydantic models validate all inputs |

### 10.3 Supabase Client Initialization

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

---

## 11. Error Handling & Resilience

### 11.1 Mobile App Error Handling

| Scenario | Handling |
|----------|----------|
| Microphone permission denied | Show permission prompt with explanation; disable record button |
| Recording fails to start | Display error toast; reset state to idle |
| Audio interruption (phone call) | Pause recording; auto-resume when interruption ends |
| Upload fails (network error) | Retry with exponential backoff (3 attempts); persist file locally |
| Upload fails permanently | Show error state on meeting; allow manual retry |
| Notification permission denied | App still works; user checks meetings list manually |
| Deep link to non-existent meeting | Show "Meeting not found" screen |

### 11.2 Backend Error Handling

```python
@router.post("/process-meeting")
async def process_meeting(request: ProcessMeetingRequest):
    meeting_id = request.meeting_id
    try:
        # Step 1-5: Download → Transcribe → Summarize → Update DB → Notify
        audio_path = await storage_service.download_audio(request.audio_url)
        transcript = await transcriber_service.transcribe(audio_path)
        summary = await summarizer_service.summarize(transcript)
        await database_service.update_meeting(meeting_id, transcript, summary)
        await notifier_service.send_notification(request.push_token, meeting_id)

        return {"status": "completed", "meeting_id": meeting_id}

    except Exception as e:
        # Mark meeting as failed so the user sees the error state
        await database_service.update_meeting_status(meeting_id, "failed")
        logger.error(f"Processing failed for meeting {meeting_id}: {e}")
        raise HTTPException(status_code=500, detail="Processing failed")

    finally:
        # Clean up temp audio file
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
```

### 11.3 Retry Strategy (Upload)

```typescript
async function uploadWithRetry(
  fileUri: string,
  meetingId: string,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadAudio(fileUri, meetingId);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Upload failed after max retries');
}
```

---

## 12. API Contracts

### 12.1 Backend API

#### `POST /api/process-meeting`

**Request:**
```json
{
  "audio_url": "https://xxx.supabase.co/storage/v1/object/sign/meeting-audio/...",
  "meeting_id": "550e8400-e29b-41d4-a716-446655440000",
  "push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Response (200):**
```json
{
  "status": "completed",
  "meeting_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (500):**
```json
{
  "detail": "Processing failed"
}
```

**Pydantic Schema:**
```python
class ProcessMeetingRequest(BaseModel):
    audio_url: str          # Signed URL to audio file in Supabase Storage
    meeting_id: str         # UUID of the meeting record
    push_token: str         # Expo Push Token for notification delivery
```

#### `GET /health`

**Response (200):**
```json
{
  "status": "ok"
}
```

### 12.2 Supabase Client Queries

| Operation | Table | Query |
|-----------|-------|-------|
| Create meeting | `meetings` | `INSERT { user_id, status: 'recording' }` |
| Update audio URL | `meetings` | `UPDATE SET audio_url, status: 'uploading' WHERE id = ?` |
| Set processing | `meetings` | `UPDATE SET status: 'processing' WHERE id = ?` |
| Get all meetings | `meetings` | `SELECT * WHERE user_id = auth.uid() ORDER BY created_at DESC` |
| Get meeting by ID | `meetings` | `SELECT * WHERE id = ? AND user_id = auth.uid()` |

---

## 13. Sequence Diagrams

### 13.1 Full Recording Flow

```
User          Mobile App         Supabase          Backend         Expo Push
 │                │                  │                 │               │
 │  Tap Record    │                  │                 │               │
 │───────────────▶│                  │                 │               │
 │                │  INSERT meeting  │                 │               │
 │                │  (status:record) │                 │               │
 │                │─────────────────▶│                 │               │
 │                │                  │                 │               │
 │                │  Start Recording │                 │               │
 │                │  (background OK) │                 │               │
 │                │◀ ─ ─ ─ ─ ─ ─ ─ ─│                 │               │
 │  Recording...  │                  │                 │               │
 │  (backgrounded)│                  │                 │               │
 │                │                  │                 │               │
 │  Tap Stop      │                  │                 │               │
 │───────────────▶│                  │                 │               │
 │                │  Stop Recording  │                 │               │
 │                │                  │                 │               │
 │                │  Upload audio    │                 │               │
 │                │─────────────────▶│  (Storage)      │               │
 │                │  audio_url       │                 │               │
 │                │◀─────────────────│                 │               │
 │                │                  │                 │               │
 │                │  POST /process-meeting             │               │
 │                │───────────────────────────────────▶│               │
 │                │                  │                 │               │
 │                │                  │  Download audio │               │
 │                │                  │◀────────────────│               │
 │                │                  │  audio file     │               │
 │                │                  │────────────────▶│               │
 │                │                  │                 │               │
 │                │                  │                 │  Transcribe   │
 │                │                  │                 │  Summarize    │
 │                │                  │                 │               │
 │                │                  │  UPDATE meeting │               │
 │                │                  │◀────────────────│               │
 │                │                  │                 │               │
 │                │                  │                 │  Push notify  │
 │                │                  │                 │──────────────▶│
 │                │                  │                 │               │
 │  Notification  │                  │                 │               │
 │◀──────────────────────────────────────────────────────────────────│
 │                │                  │                 │               │
 │  Tap notif     │                  │                 │               │
 │───────────────▶│                  │                 │               │
 │                │  GET meeting/:id │                 │               │
 │                │─────────────────▶│                 │               │
 │                │  meeting data    │                 │               │
 │                │◀─────────────────│                 │               │
 │  View detail   │                  │                 │               │
 │◀───────────────│                  │                 │               │
```

### 13.2 Error Recovery Flow

```
Mobile App              Supabase              Backend
    │                      │                     │
    │  Upload fails        │                     │
    │  (network error)     │                     │
    │──────X               │                     │
    │                      │                     │
    │  Retry (2s delay)    │                     │
    │──────X               │                     │
    │                      │                     │
    │  Retry (4s delay)    │                     │
    │─────────────────────▶│                     │
    │  Upload success      │                     │
    │◀─────────────────────│                     │
    │                      │                     │
    │  POST /process-meeting                     │
    │───────────────────────────────────────────▶│
    │                      │                     │
    │                      │   Processing fails  │
    │                      │◀────────────────────│
    │                      │   status: 'failed'  │
    │                      │                     │
    │  Poll / refresh list │                     │
    │─────────────────────▶│                     │
    │  status: 'failed'    │                     │
    │◀─────────────────────│                     │
    │                      │                     │
    │  Show error to user  │                     │
```

---

## 14. Testing Strategy

### 14.1 Mobile App

| Area | Test Type | Focus |
|------|-----------|-------|
| Config Plugin | Manual verification | Verify `Info.plist` and `AndroidManifest.xml` after prebuild |
| Audio Recording | Device testing | Background, lock screen, interruptions, long recordings |
| Upload Service | Unit + Integration | Retry logic, file handling, signed URLs |
| Deep Linking | E2E | Notification tap → correct screen in all app states |
| Screens | Component tests | Render states, user interactions, navigation |

### 14.2 Backend

| Area | Test Type | Focus |
|------|-----------|-------|
| API Routes | Integration | Request validation, response format, error codes |
| Processing Pipeline | Unit | Each service in isolation (mock OpenAI client for transcriber) |
| Notifier | Integration | Correct payload sent to Expo Push endpoint |
| Error Handling | Unit | Failure at each pipeline step → meeting status set to `failed` |

### 14.3 Critical Test Scenarios

1. **Background recording survives 30+ minutes** — Record, background app, wait, stop, verify audio integrity
2. **Phone call during recording** — Start recording, receive call, end call, verify recording resumes
3. **Upload on flaky network** — Throttle network, verify retry logic and eventual success
4. **Deep link cold start** — Kill app, tap notification, verify correct meeting screen loads
5. **RLS enforcement** — Attempt to read another user's meeting, verify 403/empty response

---

## 15. Deployment & Infrastructure

### 15.1 Mobile App

- **Development:** `npx expo start` → Expo Go (limited; dev client needed for native modules)
- **Development Build:** `npx expo prebuild` → `npx expo run:ios` / `npx expo run:android`
- **Production:** EAS Build → App Store / Play Store submission

### 15.2 Backend

```dockerfile
# Dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Environment variables:**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...       # service_role key (server-side only)
OPENAI_API_KEY=sk-...             # OpenAI API key for Whisper-1 transcription
```

**Deployment options:** Any container host (Railway, Render, Fly.io, AWS ECS) or serverless (Cloud Run).

### 15.3 Supabase

- Hosted Supabase project (free tier sufficient for MVP)
- Database migrations managed via Supabase CLI (`supabase db push`)
- Storage bucket created via dashboard or migration

### 15.4 Environment Configuration Summary

| Component | Key Config | Source |
|-----------|-----------|--------|
| Mobile App | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_URL` | `.env` |
| Backend | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY` | Environment variables |
| Supabase | RLS policies, storage bucket, auth settings | Supabase dashboard / migrations |
