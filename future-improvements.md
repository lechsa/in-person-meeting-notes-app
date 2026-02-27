# Future Improvements — Execution Plan

This document expands on the [Future Improvements](README.md#future-improvements) section of the README with concrete execution plans, rationale, and implementation steps for each improvement.

---

## Table of Contents

1. [Message Queue for Processing](#1-message-queue-for-processing)
2. [Load Balancing](#2-load-balancing)
3. [Proper Logging & Monitoring](#3-proper-logging--monitoring)
4. [Offline-Resilient Upload Queue](#4-offline-resilient-upload-queue)
5. [Improved Summarizer](#5-improved-summarizer)
6. [Virtualized Meeting List](#6-virtualized-meeting-list)

---

## 1. Message Queue for Processing

### Current State

The processing pipeline is **synchronous** — the mobile client calls `POST /api/process-meeting` and the backend executes download, transcription, summarization, DB update, and push notification all within a single request lifecycle. Long recordings can cause timeouts, and a failure at any step fails the entire pipeline with no retry.

### Goal

Decouple each processing step into independent, retryable tasks that run asynchronously via a message queue.

### Recommended Stack

- **RabbitMQ** (simpler setup, sufficient for our throughput) or **Amazon SQS** (if deploying on AWS)
- **Celery** as the Python task runner (integrates cleanly with FastAPI)
- **Redis** as the Celery result backend

### Implementation Steps

1. **Add dependencies**
   ```
   pip install celery[redis] kombu
   ```

2. **Define Celery app and task pipeline**
   Create `backend/app/worker.py`:
   ```python
   from celery import Celery

   celery_app = Celery("meeting_worker", broker="redis://localhost:6379/0")

   @celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
   def download_audio_task(self, meeting_id, audio_url):
       ...

   @celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
   def transcribe_task(self, meeting_id, audio_path):
       ...

   @celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
   def summarize_task(self, meeting_id, transcript):
       ...

   @celery_app.task(bind=True, max_retries=3, default_retry_delay=15)
   def notify_task(self, meeting_id, push_token):
       ...
   ```

3. **Chain tasks together**
   Use Celery chains so each step feeds into the next:
   ```python
   from celery import chain

   pipeline = chain(
       download_audio_task.s(meeting_id, audio_url),
       transcribe_task.s(meeting_id),
       summarize_task.s(meeting_id),
       notify_task.s(meeting_id, push_token),
   )
   pipeline.apply_async()
   ```

4. **Update the API endpoint**
   Change `POST /api/process-meeting` to enqueue the pipeline and return `202 Accepted` immediately:
   ```python
   @router.post("/api/process-meeting", status_code=202)
   async def process_meeting(request: ProcessRequest):
       pipeline.apply_async()
       return {"status": "queued", "meeting_id": request.meeting_id}
   ```

5. **Add status tracking**
   Update the `meetings` table status at each stage (`downloading`, `transcribing`, `summarizing`, `notifying`, `completed`, `failed`) so the client can poll or subscribe to progress.

6. **Infrastructure**
   - Run Redis alongside the backend (Docker Compose or managed Redis)
   - Run one or more Celery workers: `celery -A app.worker worker --loglevel=info`
   - Add a `Procfile` or Docker Compose service for the worker

### Benefits

- Each step can retry independently (e.g., Whisper API timeout doesn't lose the downloaded audio)
- Backend responds instantly, no HTTP timeout risk
- Workers can be scaled horizontally independent of the API server
- Failed tasks are visible in a Celery dashboard (Flower)

---

## 2. Load Balancing

### Current State

A single FastAPI instance serves all API requests. Under heavy load or during many concurrent processing requests, this becomes a bottleneck.

### Goal

Run multiple backend instances behind a load balancer for horizontal scaling and high availability.

### Recommended Approach

- **Containerize with Docker** (Dockerfile already exists)
- **Orchestrate with Docker Compose** for local/staging, **Kubernetes** or **AWS ECS** for production
- **Reverse proxy/load balancer**: **Nginx**, **Traefik**, or **AWS ALB**

### Implementation Steps

1. **Ensure the backend is stateless**
   - The backend already stores data in Supabase (external), so there's no server-side session state.
   - Temporary audio files should use unique paths (already using `meeting_id`-based names) and be cleaned up after processing.
   - If using Celery (see improvement #1), the task queue is external, keeping the API stateless.

2. **Create a Docker Compose production config**
   ```yaml
   # docker-compose.prod.yml
   services:
     api:
       build: ./backend
       deploy:
         replicas: 3
       environment:
         - SUPABASE_URL=${SUPABASE_URL}
         - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
         - OPEN_AI_API_KEY=${OPEN_AI_API_KEY}

     nginx:
       image: nginx:alpine
       ports:
         - "80:80"
       volumes:
         - ./nginx.conf:/etc/nginx/nginx.conf
       depends_on:
         - api

     redis:
       image: redis:7-alpine

     worker:
       build: ./backend
       command: celery -A app.worker worker --loglevel=info
       deploy:
         replicas: 2
   ```

3. **Configure Nginx load balancing**
   ```nginx
   upstream backend {
       least_conn;
       server api:8000;
   }

   server {
       listen 80;
       client_max_body_size 100M;

       location / {
           proxy_pass http://backend;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

4. **Health checks**
   The existing `/health` endpoint can be used by the load balancer to detect unhealthy instances.

5. **For cloud deployment**
   - **AWS**: ECS Fargate + ALB, or EKS
   - **GCP**: Cloud Run (auto-scales to zero) or GKE
   - **Railway / Render**: Support multi-instance deployments with built-in load balancing

### Scaling Strategy

| Component   | Scaling Trigger                  | Approach            |
| ----------- | -------------------------------- | ------------------- |
| API servers  | Request latency > 500ms, CPU > 70% | Horizontal (add replicas) |
| Celery workers | Queue depth > 50 tasks           | Horizontal (add workers)  |
| Redis        | Memory usage > 80%               | Vertical (larger instance) |

---

## 3. Proper Logging & Monitoring

### Current State

The backend uses basic `print`/`logger` statements. There is no centralized error tracking, structured logging, or alerting.

### Goal

Full observability stack: structured logs, error tracking, performance monitoring, and alerting.

### Recommended Stack

- **Sentry** — error tracking and performance monitoring (has a Python SDK and a React Native SDK)
- **Structured logging** — Python `structlog` or `python-json-logger`
- **Metrics** — Prometheus + Grafana (or Datadog for managed)

### Implementation Steps

#### Backend (FastAPI)

1. **Install Sentry**
   ```bash
   pip install sentry-sdk[fastapi]
   ```

2. **Initialize in `main.py`**
   ```python
   import sentry_sdk
   from sentry_sdk.integrations.fastapi import FastApiIntegration

   sentry_sdk.init(
       dsn=settings.SENTRY_DSN,
       integrations=[FastApiIntegration()],
       traces_sample_rate=0.2,  # 20% of requests for performance monitoring
       environment="production",
   )
   ```

3. **Add structured logging**
   ```bash
   pip install structlog
   ```
   ```python
   import structlog

   logger = structlog.get_logger()

   # In processing pipeline:
   logger.info("transcription.started", meeting_id=meeting_id, file_size=size)
   logger.info("transcription.completed", meeting_id=meeting_id, duration_seconds=elapsed)
   logger.error("transcription.failed", meeting_id=meeting_id, error=str(e))
   ```

4. **Add middleware for request logging**
   Log every request with method, path, status code, and response time.

#### Mobile App (Expo)

1. **Install Sentry for React Native**
   ```bash
   npx expo install @sentry/react-native
   ```

2. **Initialize in `app/_layout.tsx`**
   ```typescript
   import * as Sentry from "@sentry/react-native";

   Sentry.init({
     dsn: "your-sentry-dsn",
     tracesSampleRate: 0.2,
   });
   ```

3. **Wrap the root component**
   ```typescript
   export default Sentry.wrap(RootLayout);
   ```

#### Alerting Rules

| Alert                                | Trigger                          | Channel       |
| ------------------------------------ | -------------------------------- | ------------- |
| Processing pipeline failure rate     | > 5% failures in 15 min window  | Slack / Email |
| API response time (p95)             | > 2s for 5 consecutive minutes  | Slack         |
| Whisper API errors                   | Any 5xx from OpenAI API         | Slack         |
| Backend health check failure         | `/health` returns non-200       | PagerDuty     |

---

## 4. Offline-Resilient Upload Queue

### Current State

The upload service (`services/upload.ts`) retries 3 times with exponential backoff (2s → 4s → 8s), but if all retries fail (e.g., device is offline), the upload is lost. The user has to restart the recording or the meeting remains stuck in `uploading` status.

### Goal

Persist failed uploads to local storage and automatically retry when connectivity returns, even across app restarts.

### Implementation Steps

1. **Define a local upload queue schema**
   ```typescript
   // types/uploadQueue.ts
   interface QueuedUpload {
     id: string;
     meetingId: string;
     localFilePath: string;
     storagePath: string;
     attempts: number;
     lastAttempt: string; // ISO timestamp
     status: "pending" | "uploading" | "failed";
   }
   ```

2. **Persist the queue with AsyncStorage**
   ```bash
   npx expo install @react-native-async-storage/async-storage
   ```
   ```typescript
   // services/uploadQueue.ts
   import AsyncStorage from "@react-native-async-storage/async-storage";

   const QUEUE_KEY = "upload_queue";

   export async function enqueue(upload: QueuedUpload) {
     const queue = await getQueue();
     queue.push(upload);
     await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
   }

   export async function getQueue(): Promise<QueuedUpload[]> {
     const raw = await AsyncStorage.getItem(QUEUE_KEY);
     return raw ? JSON.parse(raw) : [];
   }

   export async function removeFromQueue(id: string) {
     const queue = await getQueue();
     await AsyncStorage.setItem(
       QUEUE_KEY,
       JSON.stringify(queue.filter((item) => item.id !== id))
     );
   }
   ```

3. **Monitor network connectivity**
   ```bash
   npx expo install @react-native-community/netinfo
   ```
   ```typescript
   // services/uploadQueue.ts
   import NetInfo from "@react-native-community/netinfo";

   export function startQueueProcessor() {
     NetInfo.addEventListener((state) => {
       if (state.isConnected) {
         processQueue();
       }
     });
   }

   async function processQueue() {
     const queue = await getQueue();
     for (const item of queue.filter((i) => i.status !== "uploading")) {
       try {
         item.status = "uploading";
         await uploadFile(item.localFilePath, item.storagePath);
         await removeFromQueue(item.id);
         // Continue with processing trigger...
       } catch (error) {
         item.attempts += 1;
         item.lastAttempt = new Date().toISOString();
         item.status = "failed";
         await updateQueueItem(item);
       }
     }
   }
   ```

4. **Integrate into the existing upload flow**
   Modify `services/upload.ts` so that when `uploadAudio()` fails all retries, it enqueues the upload instead of giving up:
   ```typescript
   // In uploadAudio() catch block:
   await enqueue({
     id: uuid(),
     meetingId,
     localFilePath: fileUri,
     storagePath: `${userId}/${meetingId}.m4a`,
     attempts: 3,
     lastAttempt: new Date().toISOString(),
     status: "pending",
   });
   ```

5. **Start the queue processor on app launch**
   In `app/_layout.tsx`:
   ```typescript
   useEffect(() => {
     startQueueProcessor();
   }, []);
   ```

6. **Audio file retention**
   Keep the local `.m4a` file until upload is confirmed. Currently the file may be cleaned up — add a flag or move to a persistent directory.

---

## 5. Improved Summarizer

### Current State

The summarizer uses **Luhn extractive summarization** via the `sumy` library. It picks the most important sentences from the transcript based on word frequency. This is fast and cheap but produces summaries that are essentially copy-pasted sentences from the transcript — no paraphrasing, no action items, no structured output.

### Goal

Use an LLM (like GPT-4o-mini or GPT-4o) to produce higher-quality **abstractive summaries** with structured output: key points, action items, decisions made, and participants mentioned.

### Implementation Steps

1. **Define a structured summary output format**
   ```python
   # backend/app/models/summary.py
   from pydantic import BaseModel

   class MeetingSummary(BaseModel):
       overview: str           # 2-3 sentence high-level summary
       key_points: list[str]   # Bullet point takeaways
       action_items: list[str] # Tasks assigned with owners if mentioned
       decisions: list[str]    # Decisions made during the meeting
   ```

2. **Replace the summarizer with an LLM call**
   ```python
   # backend/app/services/summarizer.py
   from openai import OpenAI

   client = OpenAI(api_key=settings.OPEN_AI_API_KEY)

   SYSTEM_PROMPT = """You are a meeting notes assistant. Given a meeting transcript,
   produce a structured summary in JSON format with these fields:
   - overview: 2-3 sentence high-level summary
   - key_points: list of key takeaways
   - action_items: list of action items (include who is responsible if mentioned)
   - decisions: list of decisions made

   Be concise and factual. Only include information explicitly stated in the transcript."""

   def summarize(transcript: str) -> MeetingSummary:
       response = client.chat.completions.create(
           model="gpt-4o-mini",  # Cost-effective, fast
           messages=[
               {"role": "system", "content": SYSTEM_PROMPT},
               {"role": "user", "content": transcript},
           ],
           response_format={"type": "json_object"},
           temperature=0.3,
           max_tokens=1000,
       )
       data = json.loads(response.choices[0].message.content)
       return MeetingSummary(**data)
   ```

3. **Update the database schema**
   Add structured columns or store as JSON:
   ```sql
   ALTER TABLE meetings
       ADD COLUMN key_points JSONB DEFAULT '[]',
       ADD COLUMN action_items JSONB DEFAULT '[]',
       ADD COLUMN decisions JSONB DEFAULT '[]';
   ```
   Or continue storing everything in the `summary` column as formatted text.

4. **Update the mobile app meeting detail screen**
   Render the structured summary with sections:
   ```
   📋 Overview
   ...

   🔑 Key Points
   • ...
   • ...

   ✅ Action Items
   • ...

   📌 Decisions
   • ...
   ```

5. **Fallback strategy**
   Keep the existing Luhn summarizer as a fallback if the LLM API call fails:
   ```python
   try:
       summary = llm_summarize(transcript)
   except Exception:
       logger.warning("LLM summarization failed, falling back to extractive")
       summary = extractive_summarize(transcript)
   ```

6. **Cost considerations**
   - GPT-4o-mini: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
   - A 30-minute meeting transcript ≈ 5,000 words ≈ 7,000 tokens → ~$0.001 per summary
   - At 1,000 meetings/day, that's ~$1/day — very affordable

---

## 6. Virtualized Meeting List

### Current State

The meetings screen uses React Native's `FlatList` and fetches **all meetings at once** with `supabase.from('meetings').select('*').order('created_at', { ascending: false })`. For users with hundreds of meetings, this will cause:
- Slow initial load
- High memory usage
- Sluggish scrolling

### Goal

Virtualized rendering, cursor-based pagination, and search/filtering for a fast, scalable meeting list.

### Implementation Steps

#### A. Switch to FlashList

1. **Install FlashList**
   ```bash
   npx expo install @shopify/flash-list
   ```

2. **Replace FlatList in `app/(tabs)/meetings.tsx`**
   ```tsx
   import { FlashList } from "@shopify/flash-list";

   <FlashList
     data={meetings}
     renderItem={({ item }) => <MeetingCard meeting={item} />}
     estimatedItemSize={100} // Approximate height of MeetingCard in px
     keyExtractor={(item) => item.id}
     onRefresh={refetch}
     refreshing={isRefreshing}
     onEndReached={loadMore}
     onEndReachedThreshold={0.5}
   />
   ```

#### B. Add Cursor-Based Pagination

1. **Update the `useMeetings` hook**
   ```typescript
   const PAGE_SIZE = 20;

   const [meetings, setMeetings] = useState<Meeting[]>([]);
   const [cursor, setCursor] = useState<string | null>(null);
   const [hasMore, setHasMore] = useState(true);

   async function fetchMeetings(afterCursor?: string) {
     let query = supabase
       .from("meetings")
       .select("*")
       .order("created_at", { ascending: false })
       .limit(PAGE_SIZE);

     if (afterCursor) {
       query = query.lt("created_at", afterCursor);
     }

     const { data, error } = await query;

     if (data) {
       if (afterCursor) {
         setMeetings((prev) => [...prev, ...data]);
       } else {
         setMeetings(data);
       }
       setCursor(data.length > 0 ? data[data.length - 1].created_at : null);
       setHasMore(data.length === PAGE_SIZE);
     }
   }

   function loadMore() {
     if (hasMore && cursor) {
       fetchMeetings(cursor);
     }
   }
   ```

#### C. Add Search & Filtering

1. **Add a search bar to the meetings screen**
   ```tsx
   const [searchQuery, setSearchQuery] = useState("");

   <TextInput
     placeholder="Search meetings..."
     value={searchQuery}
     onChangeText={setSearchQuery}
     style={styles.searchBar}
   />
   ```

2. **Filter on the server side**
   ```typescript
   async function searchMeetings(query: string) {
     const { data } = await supabase
       .from("meetings")
       .select("*")
       .or(`summary.ilike.%${query}%,transcript.ilike.%${query}%`)
       .order("created_at", { ascending: false })
       .limit(PAGE_SIZE);

     setMeetings(data ?? []);
   }
   ```

3. **Add filter chips for status**
   ```tsx
   const STATUS_FILTERS = ["all", "completed", "processing", "failed"];

   <ScrollView horizontal>
     {STATUS_FILTERS.map((status) => (
       <Chip
         key={status}
         selected={activeFilter === status}
         onPress={() => setActiveFilter(status)}
       >
         {status}
       </Chip>
     ))}
   </ScrollView>
   ```

4. **Debounce search input**
   ```typescript
   import { useMemo } from "react";
   import debounce from "lodash.debounce";

   const debouncedSearch = useMemo(
     () => debounce((q: string) => searchMeetings(q), 300),
     []
   );
   ```

---

## Priority & Sequencing

Recommended order of implementation based on impact and dependencies:

| Priority | Improvement                   | Effort   | Impact   | Dependencies          |
| -------- | ----------------------------- | -------- | -------- | --------------------- |
| 1        | Improved Summarizer           | Low      | High     | None (uses existing OpenAI key) |
| 2        | Proper Logging & Monitoring   | Low      | High     | None                  |
| 3        | Offline-Resilient Upload Queue | Medium  | High     | None                  |
| 4        | Virtualized Meeting List      | Medium   | Medium   | None                  |
| 5        | Message Queue for Processing  | High     | High     | Redis/RabbitMQ infra  |
| 6        | Load Balancing                | High     | Medium   | Containerization, #5  |

Start with the **Improved Summarizer** — it's the highest value with the lowest effort since the OpenAI client is already in the project for Whisper. Then add **logging/monitoring** to gain observability before tackling infrastructure changes.
