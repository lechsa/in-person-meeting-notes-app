# In Person Meeting Notes App

A mobile app for recording in-person meetings, transcribing audio, and generating summaries. Built with Expo (React Native) and a FastAPI backend.

## Screen Recordings
- [Android Screen Recording Video](https://drive.google.com/file/d/1OygUqG24X4TWV1U2wVheJAeHl9Imfgyg/view)
- [iOS Screen Recording Video](https://drive.google.com/file/d/1JjSgzkllVnSgRYeUuYGID6tIucr5zqcy/view)

## Test User Account
email: test@test.com
password: test123

If you want to create a new account, you will need to check your email to confirm your email before sign in. Please check your spam email from Supabase. 

## How to Run Locally

### Prerequisites

- **Node.js** (v18+)
- **Python** (3.12+)
- **ffmpeg** — required by the backend for audio processing
  ```bash
  # macOS
  brew install ffmpeg
  ```
- **Xcode** (for iOS) — install from the Mac App Store
- **Android Studio** (for Android) — with an emulator or a physical device with [USB debugging enabled](https://developer.android.com/studio/debug/dev-options)
- A **Supabase** project — We already created one for testing, shared via email.
- An **OpenAI** API key — We already created one for testing, shared via email.

---

### 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/in-person-meeting-notes-app.git
cd in-person-meeting-notes-app
```

### 2. Set Up Environment Variables

#### Frontend (Expo)

Create a `.env` file in the project root, you can copy `.env.example`

`.env` values for frontend is shared via email

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_BACKEND_URL=http://<your-local-ip>:8000
```

> **Tip:** Run `ipconfig getifaddr en0` (macOS) to get your local IP. Use this instead of `localhost` so physical devices can reach the backend.

#### Backend

Create a `.env` file inside the `backend/` directory, you can copy `.env.example`

`.env` values for backend is shared via email

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
OPEN_AI_API_KEY=your-openai-api-key
```

### 3. Set Up Supabase

Note: You don't need this, if you connect to existing Supabase that has been created and shared via email
After creating your Supabase project, run the migration to set up the database schema, RLS policies, and storage bucket. Open the **SQL Editor** in your [Supabase Dashboard](https://supabase.com/dashboard) and paste the contents of:

```
supabase/migrations/20260212000000_create_meetings_and_rls.sql
```

This creates:
- The `meetings` table with RLS policies (users can only access their own data)
- The `meeting-audio` storage bucket with upload/read policies

### 4. Install Dependencies

#### Frontend

```bash
npm install
```

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Start the Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. Verify with:

```bash
curl http://localhost:8000/health
```

### 6. Run the App

#### iOS (requires macOS + Xcode)

```bash
npx expo run:ios
```

To run on a physical iPhone:

```bash
npx expo run:ios --device
```

#### Android

```bash
npx expo run:android
```

To run on a physical Android device:

1. Enable **Developer Options** and **USB Debugging** on your phone.
2. Connect via USB and accept the debugging prompt.
3. Verify the device is detected:
   ```bash
   adb devices
   ```
4. Run:
   ```bash
   npx expo run:android --device
   ```

---

### Project Structure

```
├── app/                  # Expo Router screens & layouts
├── assets/               # Icons, splash screen images
├── backend/              # FastAPI backend (transcription & summarization)
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── models/       # Pydantic schemas
│   │   └── services/     # Database, transcription, summarization
│   ├── requirements.txt
│   └── Dockerfile
├── components/           # Reusable React Native components
├── hooks/                # Custom React hooks
├── lib/                  # Constants & Supabase client
├── plugins/              # Expo config plugins (background audio)
├── services/             # Frontend service layer (auth, audio, upload, etc.)
└── types/                # TypeScript type definitions
```

---

## Architecture Decisions

For the full technical design, see the [Software Design Document (SDD)](Software-Design-Document.md).


---

## Future Improvements

Areas we'd improve given more time:

### Scalability & Reliability

- **Message queue for processing** — Use Kafka or RabbitMQ to handle audio processing, transcription, summarization, and push notifications. This improves scalability, lessen the load on backend, stream the process to consumers, and enables automated retries for failed processes.
- **Load balancing** — Run multiple backend instances behind a load balancer for horizontal scaling.
- **Proper logging & monitoring** — Integrate tools like Sentry for error tracking, structured logging, and alerting.
- **Offline-resilient upload queue** — Persist failed uploads locally on the device and automatically retry when connectivity returns.
- **Summarizer** - Using advanced or better LLM and Machine Learning to get better summary result from the transcript. 
- **Virtualized meeting list** — Use `FlashList` or similar for virtualized rendering, add load-more pagination, and implement search/filtering.
