# Implementation Todo List

Derived from the Software Design Document (SDD) v1.0.  
Each phase ends with a testable milestone.

---

## Phase 1: Project Scaffold & Config Plugin

> **Test:** `npx expo prebuild` succeeds → native files contain correct background audio permissions → `npx expo start` boots the app

- [ ] Initialize Expo project with SDK 54 and TypeScript template
- [ ] Configure `app.json` (scheme: `meetingnotes`, plugins, app name)
- [ ] Set up `tsconfig.json`
- [ ] Create project folder structure (`app/`, `components/`, `services/`, `hooks/`, `lib/`, `types/`, `plugins/`)
- [ ] Install core dependencies (`expo-av`, `expo-router`, `expo-notifications`, `expo-file-system`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`)
- [ ] Create `plugins/withBackgroundAudio/index.ts` — plugin entry point composing iOS + Android
- [ ] Create `plugins/withBackgroundAudio/withBackgroundAudioIOS.ts` — add `UIBackgroundModes: ['audio']` to `Info.plist` and `NSMicrophoneUsageDescription`
- [ ] Create `plugins/withBackgroundAudio/withBackgroundAudioAndroid.ts` — add `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` permissions + foreground service declaration
- [ ] Register plugin in `app.json` under `plugins`
- [ ] Create `lib/constants.ts` — app-wide constants (API URLs, bucket names, etc.)
- [ ] Create `types/index.ts` — TypeScript type definitions (Meeting, MeetingStatus, RecordingState, etc.)
- [ ] Run `npx expo prebuild` and verify:
  - [ ] `Info.plist` contains `UIBackgroundModes: ['audio']` and `NSMicrophoneUsageDescription`
  - [ ] `AndroidManifest.xml` contains `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` permissions and foreground service declaration
- [ ] Verify app boots with `npx expo start`

---

## Phase 2: Database, Auth & Login Screen

> **Test:** Sign up → sign in → see empty home screen → sign out → redirected to login. Verify RLS blocks unauthenticated access in Supabase dashboard.

- [ ] Create Supabase project (hosted)
- [ ] Set up environment variables (`.env` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_URL`)
- [ ] Create `meetings` table with schema (id, user_id, audio_url, transcript, summary, status, duration, created_at, updated_at)
- [ ] Add `CHECK` constraint on status column (`recording`, `uploading`, `processing`, `completed`, `failed`)
- [ ] Create index `idx_meetings_user_id_created` on `(user_id, created_at DESC)`
- [ ] Enable Row-Level Security on `meetings` table
- [ ] Create RLS policy: users can SELECT own meetings
- [ ] Create RLS policy: users can INSERT own meetings
- [ ] Create RLS policy: users can UPDATE own meetings
- [ ] Create RLS policy: service role can UPDATE any meeting
- [ ] Create `meeting-audio` storage bucket (private)
- [ ] Create storage RLS policy: users can upload to `{user_id}/` folder
- [ ] Create storage RLS policy: users can read from `{user_id}/` folder
- [ ] Enable Supabase Auth (email/password)
- [ ] Create `lib/supabase.ts` — Supabase client initialization with AsyncStorage for session persistence
- [ ] Create `services/auth.ts` — sign-in, sign-up, sign-out, session check functions
- [ ] Create `app/_layout.tsx` — root layout with auth guard (redirect to login if no session)
- [ ] Create login/signup screen
- [ ] Create `app/(tabs)/_layout.tsx` — tab navigator (Home, Meetings) as placeholder
- [ ] Create `app/(tabs)/index.tsx` — placeholder home screen
- [ ] Verify: sign up → sign in → home screen → sign out → login screen

---

## Phase 3: Recording + Home Screen UI

> **Test:** Tap record → see live duration counter → background the app → wait → bring app back → stop → verify local audio file exists on device. Test on both iOS and Android.

- [ ] Create `services/audio.ts` — AudioService with `startRecording()`, `stopRecording()`, `getRecordingStatus()`
- [ ] Configure `Audio.setAudioModeAsync()` for background recording (`allowsRecordingIOS`, `playsInSilentModeIOS`, `staysActiveInBackground`)
- [ ] Define recording options (M4A/AAC, 44100 Hz, mono, 128kbps) for iOS and Android
- [ ] Implement audio interruption handling (pause on focus loss, resume on focus regain)
- [ ] Create `hooks/useRecording.ts` — recording state management hook (isRecording, duration, status, uri)
- [ ] Create `components/RecordButton.tsx` — animated record/stop button
- [ ] Create `components/StatusBadge.tsx` — processing status indicator
- [ ] Update `app/(tabs)/index.tsx` — home screen with record/stop button, duration display, status indicator
- [ ] Test recording continues when app is backgrounded (iOS)
- [ ] Test recording continues when app is backgrounded (Android)
- [ ] Test recording continues when screen is locked
- [ ] Test recording survives 30+ minute session
- [ ] Test phone call interruption → recording pauses and resumes

---

## Phase 4: Upload, Meetings List & Meeting Detail

> **Test:** Record → stop → audio uploads to Supabase Storage → meeting row created in DB → meeting appears in list with status badge → tap meeting → see detail screen (transcript shows "processing" state).

- [x] Create `services/meetings.ts` — CRUD operations (create, getAll, getById, updateStatus)
- [x] Create `services/upload.ts` — upload audio to Supabase Storage (`{user_id}/{meeting_id}.m4a`)
- [x] Implement upload retry with exponential backoff (3 attempts: 2s, 4s, 8s delays)
- [x] Create `services/processing.ts` — trigger backend `POST /process-meeting` (will fail gracefully until backend exists)
- [x] Create `hooks/useMeetings.ts` — meetings data fetching hook
- [x] Create `components/MeetingCard.tsx` — meeting list item (date, duration, status badge)
- [x] Create `components/TranscriptView.tsx` — scrollable transcript display
- [x] Update `app/(tabs)/meetings.tsx` — meetings list with pull-to-refresh, sorted by date desc
- [x] Create `app/meeting/[id].tsx` — meeting detail with transcript, summary, and loading/error states
- [x] Wire up full recording flow: Record → Stop → Create meeting → Upload → Update status
- [ ] Verify: audio appears in Supabase Storage bucket
- [ ] Verify: meeting row exists in DB with correct `audio_url` and `uploading`/`processing` status
- [ ] Verify: meetings list shows the new meeting
- [ ] Verify: tapping a meeting navigates to detail screen

---

## Phase 5: Python Backend

> **Test:** `curl POST /api/process-meeting` with a real audio URL from Supabase → meeting record in DB updated with transcript + summary + status `completed`. Verify with `GET /health` for basic connectivity.

- [x] Initialize backend project structure (`backend/app/`, `main.py`, `api/`, `services/`, `models/`, `config.py`)
- [x] Create `requirements.txt` (fastapi, uvicorn, httpx, openai, pydub, python-dotenv, supabase)
- [x] Create `.env.example` with required environment variables
- [x] Create `app/config.py` — environment configuration (SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY)
- [x] Create `app/main.py` — FastAPI app with health endpoint
- [x] Create `app/models/schemas.py` — Pydantic models (ProcessMeetingRequest)
- [x] Create `app/services/storage.py` — StorageService: download audio from Supabase Storage to temp file
- [x] Create `app/services/transcriber.py` — TranscriberService: Whisper-1 transcription with chunking for files > 25 MB
- [x] Create `app/services/summarizer.py` — SummarizerService: generate summary from transcript (MVP: truncated)
- [x] Create `app/services/database.py` — DatabaseService: update meeting record with transcript + summary
- [x] Create `app/services/notifier.py` — NotifierService: send Expo push notification with deep link data
- [x] Create `app/api/routes.py` — `POST /api/process-meeting` endpoint orchestrating the 5-step pipeline
- [x] Implement error handling: set meeting status to `failed` on any pipeline step failure
- [x] Implement temp file cleanup in `finally` block
- [x] Create `Dockerfile` for backend deployment
- [ ] Test `GET /health` returns `{"status": "ok"}`
- [ ] Test full pipeline with curl: upload test audio to Supabase → call `/api/process-meeting` → verify DB updated with transcript + summary
- [ ] Test error case: invalid meeting_id → status set to `failed`
- [ ] Test Whisper-1 transcription with real audio file
- [ ] Test large audio file chunking (> 25 MB)

---

## Phase 6: Notifications, Deep Links & End-to-End

> **Test:** Full flow on device: Record → stop → upload → backend processes → push notification arrives → tap notification → app opens to correct meeting detail with transcript and summary. Test in all 3 app states (foreground, background, killed).

- [x] Create `services/notifications.ts` — register for push notifications, get Expo Push Token
- [x] Implement foreground notification listener (in-app banner)
- [x] Implement notification response listener (tap → `router.push('/meeting/{id}')`)
- [x] Implement cold-start deep link handling via `Notifications.getLastNotificationResponseAsync()`
- [x] Create `hooks/useNotifications.ts` — notification setup hook
- [x] Set up notification listeners in `app/_layout.tsx`
- [x] Configure deep link scheme (`meetingnotes:///meeting/{meeting_id}`)
- [x] Wire up push token: pass token to backend when triggering `/process-meeting`
- [ ] End-to-end test: Record → upload → backend processes → notification received → tap → view transcript
- [ ] Test notification tap → correct meeting (app foregrounded)
- [ ] Test notification tap → correct meeting (app backgrounded)
- [ ] Test notification tap → correct meeting (app killed / cold start)
- [ ] Test RLS enforcement: user A cannot access user B's meetings

---

## Phase 7: Polish, Docs & Deployment

> **Test:** Backend deployed and reachable → full E2E flow works against production infrastructure → README is complete → repo is public.

- [ ] Review and harden error handling across mobile app (permission denied, upload failure, meeting not found)
- [ ] Test upload on flaky/throttled network → retry logic works
- [ ] Write `README.md`: how to run locally (mobile app + backend)
- [ ] Write `README.md`: architecture decisions (1 page max)
- [ ] Write `README.md`: what you'd improve with more time
- [ ] Deploy backend (Railway / Render / Fly.io / Cloud Run)
- [ ] Configure production environment variables on hosting platform
- [ ] Update mobile app `BACKEND_URL` to point to deployed backend
- [ ] Full smoke test on deployed environment
- [ ] Push to public GitHub repository
