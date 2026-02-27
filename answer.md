# Senior React Native Developer — Interview Answers (2026)

---

## 1. Architecture & The New Engine

### JSI vs. The Bridge

The **old Bridge** was an asynchronous message queue. Every call between JavaScript and Native was serialized to JSON, sent across the bridge, deserialized on the other side, processed, and the result serialized back. This introduced:

- **Latency** — every single interaction required async round-trips through the queue.
- **Serialization overhead** — complex objects (especially large arrays or binary data) had to be converted to/from JSON strings.
- **No shared memory** — JS and Native lived in completely isolated heaps; data had to be copied.

**JSI (JavaScript Interface)** replaces this entirely. JSI is a lightweight C++ layer that exposes **host objects** directly into the JavaScript runtime. This means:

- **Synchronous execution** — JS can call a C++ (and by extension, Objective-C/Swift or Java/Kotlin) function directly and get a return value in the same frame. No queue, no serialization.
- **Shared memory** — Both JS and Native can hold references to the same underlying C++ object. For example, a native view's layout properties can be read by JS without copying.
- **Runtime agnostic** — JSI is not tied to JavaScriptCore. It's an abstraction layer, which is why React Native can now use **Hermes** (or V8, or any conforming engine) without changing the native module API.

**Practical impact**: In our Meeting Notes app, we have `newArchEnabled: true` in `app.json`. This means all Expo modules we use (`expo-audio`, `expo-notifications`, `expo-file-system`) are communicating via JSI instead of the bridge. For example, when we call `expo-audio` to start a recording, the native audio session is started via a synchronous JSI call rather than an async bridge message — reducing the delay between the user tapping "Record" and the microphone actually activating.

---

### TurboModules

Legacy native modules were **eagerly loaded** — every single native module was initialized at app startup, even if it was never used. If you had 50 native modules, all 50 would spin up during launch.

**TurboModules** are **lazy-loaded**. A module is only initialized when JavaScript first imports/calls it. The mechanism:

1. JS calls `TurboModuleRegistry.get('ModuleName')`.
2. The registry checks if the module is already instantiated.
3. If not, it creates the native module instance on demand and returns a JSI host object.
4. Subsequent calls reuse the cached instance.

**Startup improvement**: Only modules needed for the initial screen are loaded. In our app, `expo-notifications` (for push token registration) and `expo-audio` (for mic permissions check) load at startup, but `expo-file-system` (for upload) only loads when the user actually finishes a recording. This shaves off initialization time proportional to the number of unused modules.

TurboModules also use **Codegen** (covered in Section 4) to generate type-safe C++ interfaces from a TypeScript/Flow spec, eliminating runtime type checking that the old bridge had to do.

---

### Fabric Renderer

Fabric is the **new rendering system** that replaces the old UI Manager. The old renderer:

1. JS builds the shadow tree (layout) → sends it over the bridge → Native applies it.
2. All layout calculations happen async. If JS and Native are out of sync, you get visual glitches.

**Fabric's pipeline**:

1. **Render Phase (JS thread)** — React reconciles and produces a new tree of `ShadowNode` objects. These are C++ objects shared via JSI (not serialized JSON).
2. **Commit Phase (Background thread)** — The new shadow tree is diffed against the previous one. Layout calculations (Yoga) run here.
3. **Mount Phase (Main/UI thread)** — Only the delta (changed nodes) is applied to the native view hierarchy.

**Key capabilities Fabric enables**:

- **Synchronous Layouts** — Because shadow nodes are C++ objects accessible from both JS and Native via JSI, layout can be measured synchronously. This is critical for things like `onLayout` callbacks that need to return a measurement immediately (e.g., positioning a tooltip relative to a button). The old renderer couldn't do this — you'd get the measurement one frame later.
- **Priority Updates (Concurrent Features)** — Fabric integrates with React's concurrent rendering. Updates can be assigned priorities:
  - **Discrete (high priority)** — user input like taps, text input. Applied synchronously in the current frame.
  - **Default priority** — normal state updates. Can be interrupted by higher-priority work.
  - **Transition/deferred** — background data fetches, large list re-renders. Can be spread across multiple frames.
  This means a user's tap response is never delayed by a large list re-render happening in the background.
- **Multi-threaded rendering** — The commit phase runs on a background thread, freeing both the JS thread and the UI thread. The old renderer blocked the UI thread for layout diffing.

---

### Bridgeless Mode

**Bridgeless Mode** is the final step of the New Architecture migration — it completely removes the legacy bridge from the runtime. When enabled:

- The `RCTBridge` singleton is gone. No more `[bridge enqueueJSCall:...]`.
- All communication goes through JSI (TurboModules for native modules, Fabric for UI).
- The `NativeEventEmitter` uses JSI-backed event delivery instead of bridge events.
- `requireNativeComponent` is replaced with Fabric's component registry.

**Prerequisites for migrating a legacy app to bridgeless**:

1. **All native modules must be TurboModules** — Any module still using `RCT_EXPORT_MODULE()` without a TurboModule spec will not work. You need to write a Codegen spec (TypeScript/Flow) and implement the generated C++ interface.
2. **All native UI components must be Fabric components** — Components using the old `requireNativeComponent` / `ViewManager` API need to be migrated to Fabric's `ComponentNameNativeComponent` pattern.
3. **No direct bridge access** — Any code that accesses `self.bridge` in Objective-C or `reactContext.catalystInstance` in Java must be refactored to use `TurboModuleRegistry` or the new `ReactContext`.
4. **Third-party library compatibility** — All dependencies must support the New Architecture. In 2026, most maintained libraries do, but legacy unmaintained libraries may still use the bridge. Use the [React Native Directory](https://reactnative.directory) to check compatibility.
5. **Interop layer as a stepping stone** — React Native provides an interop layer that wraps legacy modules/components to work in bridgeless mode. This lets you migrate incrementally, but for full bridgeless you eventually want to remove the interop wrappers.

In our project, we already have `"newArchEnabled": true` in `app.json`, which enables Fabric + TurboModules. Since we use Expo SDK 54 and all our dependencies are Expo modules (which are built on TurboModules), we are effectively running bridgeless.

---

### React Fiber — How It Works

**Fiber** is React's reconciliation engine, introduced in React 16. It replaced the old "Stack Reconciler" and is the foundation that makes concurrent rendering, Suspense, and the Fabric renderer possible.

#### The Problem With the Stack Reconciler

The old reconciler worked like a recursive function call. When state changed:

1. React recursively walked the entire component tree top-down.
2. It compared old virtual DOM nodes with new ones (diffing).
3. It applied all changes to the real DOM/Native views.

This was **synchronous and uninterruptible**. If you had a tree with 10,000 nodes, React would block the main thread until it finished diffing all of them. During that time — no user input, no animations, no screen updates. The result: jank.

#### What Fiber Changed

Fiber reimagines the component tree as a **linked list of "fiber nodes"** instead of a recursive call stack. Each fiber node is a plain JavaScript object that represents a unit of work:

```
FiberNode {
  type: 'MeetingCard',           // Component type
  key: 'meeting-123',
  stateNode: <instance>,         // The actual component instance or DOM node
  child: FiberNode | null,       // First child
  sibling: FiberNode | null,     // Next sibling
  return: FiberNode | null,      // Parent
  pendingProps: { ... },         // New props to apply
  memoizedProps: { ... },        // Props from last render
  memoizedState: { ... },        // State from last render
  effectTag: 'UPDATE',           // What needs to happen (place, update, delete)
  lanes: 0b0000100,              // Priority bitmask
}
```

The tree traversal uses these `child` / `sibling` / `return` pointers instead of recursion. This means React can **pause** at any fiber node, save its position, and resume later — something impossible with a recursive call stack (you can't pause halfway up a call stack).

#### The Two-Phase Process

Fiber splits rendering into two distinct phases:

**Phase 1: Render / Reconciliation (interruptible)**

React walks the fiber tree and builds a **work-in-progress (WIP) tree** — a clone of the current tree with updates applied. During this phase:

1. React picks up the next fiber node to process.
2. Calls the component's render function (or runs the function component).
3. Diffs the returned elements against the current fiber's children.
4. Creates/updates/marks fiber nodes for deletion.
5. **Checks if it should yield** — if a higher-priority update arrived (e.g., user typed something), React pauses this work and handles the urgent update first. It can later resume where it left off.

No side effects happen in this phase. No DOM/Native mutations, no `useEffect` callbacks, no lifecycle methods that touch the outside world. This is why it's safe to interrupt and restart.

**Phase 2: Commit (synchronous, uninterruptible)**

Once the WIP tree is complete, React **commits** all the changes in one synchronous batch:

1. **Before mutation** — read current DOM layout (for `getSnapshotBeforeUpdate`).
2. **Mutation** — apply all DOM/Native changes (inserts, updates, deletions).
3. **Layout** — run `useLayoutEffect`, `componentDidMount`, `componentDidUpdate`.
4. **Passive effects** — schedule `useEffect` callbacks (asynchronously, after paint).

The commit phase is fast because it's just applying a pre-computed diff — no component logic runs here. And it's uninterruptible to ensure the UI is never in an inconsistent half-updated state.

#### Double Buffering

Fiber maintains **two trees** at all times:

- **Current tree** — represents what's currently on screen.
- **Work-in-progress (WIP) tree** — the next version being built.

When the WIP tree is committed, it becomes the new current tree. The old current tree becomes available for reuse as the next WIP tree. This is "double buffering" — the same technique GPUs use to avoid screen tearing.

```
Current Tree (on screen)     WIP Tree (being built)
        A                            A'
       / \                          / \
      B   C          ──▶           B   C'  ← C has new state
     / \                          / \
    D   E                        D   E

    After commit: WIP becomes Current. Old Current is recycled.
```

#### Priority Lanes

Fiber assigns **priority lanes** (a bitmask) to each update. This is how React decides what to work on first:

| Lane | Priority | Example |
|------|----------|---------|
| `SyncLane` | Highest | `flushSync()`, text input |
| `InputContinuousLane` | High | Mouse move, drag |
| `DefaultLane` | Normal | `setState` from event handler |
| `TransitionLane` | Low | `startTransition()` — search results, tab switches |
| `IdleLane` | Lowest | Offscreen prefetching |

When a high-priority update arrives while React is processing a low-priority one:

1. React **interrupts** the current low-priority render.
2. Processes the high-priority update to completion (render + commit).
3. **Restarts** the low-priority render from scratch (the WIP tree built so far is discarded).

This is why the render phase must be **pure and side-effect-free** — it might be thrown away and restarted. Any code with side effects (API calls, subscriptions) must go in `useEffect` (commit phase), not in the render body.

#### Practical Example: Why This Matters

Consider a meeting list search in our app. Without Fiber/concurrent features:

```typescript
// User types "standup" → 500 meetings filtered → UI freezes during re-render
const [query, setQuery] = useState('');
const filtered = meetings.filter(m => m.summary.includes(query)); // Expensive
```

With concurrent features (enabled by Fiber):

```typescript
const [query, setQuery] = useState('');
const [deferredQuery, setDeferredQuery] = useState('');

// Typing updates immediately (SyncLane)
const handleChange = (text: string) => {
  setQuery(text);  // High priority — input field updates instantly
  startTransition(() => {
    setDeferredQuery(text);  // Low priority — filter can be interrupted
  });
};

// This re-render can be paused/restarted without blocking input
const filtered = meetings.filter(m => m.summary.includes(deferredQuery));
```

The input stays responsive at 60fps because React processes the `setQuery` update first (SyncLane), then works on the `setDeferredQuery` filter (TransitionLane) in idle time. If the user types another character before filtering finishes, React discards the in-progress filter and starts over with the new query.

#### Fiber → Fabric Connection

In React Native specifically, Fiber is the **JS-side reconciler** and Fabric is the **native-side renderer**. They work together:

1. **Fiber** runs component functions, diffs the tree, and produces a list of mutations (create view, update props, delete view).
2. **Fabric** receives these mutations via JSI (shared C++ shadow nodes) and applies them to native views.
3. Fiber's interruptible rendering feeds directly into Fabric's **priority-based mounting** — a high-priority gesture update can preempt a low-priority list re-render all the way through to the native layer.

Without Fiber's ability to pause and prioritize work, Fabric's synchronous layout and concurrent features wouldn't be possible. Fiber is the engine; Fabric is the output pipeline.

---

## 2. Performance & Optimization

### FlashList vs. FlatList

**FlatList** uses a **virtualization** strategy: it renders items within a "window" around the visible area and unmounts items outside of it. When you scroll, it:

1. Unmounts off-screen items (destroying their React component instances and native views).
2. Mounts new items coming into view (creating new React components and native views from scratch).

This constant mount/unmount cycle is expensive, especially for complex items (views with images, nested components, etc.). It also causes **blank flashes** — the area where new items should appear is empty for a frame or two while React creates the views.

**FlashList** uses **cell recycling**, inspired by `UICollectionView` (iOS) / `RecyclerView` (Android):

1. When an item scrolls off-screen, its native view is **not destroyed**. Instead, it's placed in a **recycling pool**.
2. When a new item needs to appear, FlashList grabs a view from the pool and **re-binds** it with new data (updates text, image source, etc.).
3. The React component re-renders with new props, but the underlying native view is reused.

**Why this is faster**:
- No native view creation/destruction — the most expensive operation is avoided.
- Less GC pressure — fewer objects are created and disposed.
- No blank areas — recycled cells are available instantly.
- `estimatedItemSize` helps FlashList pre-calculate scroll positions without measuring every item.

**When to still use FlatList**: For short, simple lists (< 50 items with lightweight rendering), FlatList is fine and has zero additional dependencies. Our Meeting Notes app currently uses FlatList for the meetings list — for a V2 with potentially hundreds of meetings, FlashList would be the right upgrade.

---

### Off-Main-Thread Logic

React Native has three main threads:

1. **JS Thread** — runs React logic, state updates, business logic.
2. **UI Thread (Main Thread)** — renders native views, handles touch events.
3. **Shadow Thread** — layout calculations (Yoga).

If you run a heavy computation on the JS thread (e.g., parsing a large JSON, complex sort/filter), it blocks React from processing state updates → the UI freezes ("jank").

**Solutions**:

1. **Reanimated Worklets** — `react-native-reanimated` lets you define "worklets" — small JS functions that run on the **UI thread** directly (compiled to a small JS VM on the UI thread). This is primarily for animations:
   ```javascript
   const animatedStyle = useAnimatedStyle(() => {
     'worklet';
     return { transform: [{ translateX: withSpring(offset.value) }] };
   });
   ```
   The animation calculation runs entirely on the UI thread at 120fps — the JS thread being busy doesn't affect it at all. Gesture handlers (`react-native-gesture-handler`) also dispatch to worklets, so a swipe-to-delete gesture can animate smoothly even if the JS thread is processing data.

2. **Web Workers / `react-native-multithreading`** — For CPU-heavy business logic (not animations), spawn a separate thread:
   ```javascript
   const result = await runOnJS(() => {
     // This runs on a background thread
     return heavyComputation(data);
   });
   ```

3. **`InteractionManager.runAfterInteractions()`** — Defer non-urgent work until animations/transitions complete:
   ```javascript
   InteractionManager.runAfterInteractions(() => {
     // Parse large dataset, sync to DB, etc.
   });
   ```

4. **Native modules for truly heavy work** — Offload to native (Swift/Kotlin) for things like audio processing, image manipulation, or ML inference. In our app, audio encoding is handled natively by `expo-audio`, not in JS.

---

### Memory Leaks

Common causes of memory leaks in React Native:

1. **Uncleared event listeners / subscriptions** — forgetting to call `.remove()` on notification listeners, EventEmitter subscriptions, or `NetInfo.addEventListener`.
2. **Closures capturing stale references** — a `useEffect` callback holding a reference to a large object that should have been garbage collected.
3. **Unreleased native resources** — audio sessions, camera instances, file handles not being closed.
4. **Timers** — `setInterval` or `setTimeout` referencing component state after unmount.

**Detection tools**:

- **Xcode Instruments → Leaks** — Attach to the running iOS app, run the Leaks instrument. It shows leaked objects with their allocation stack trace. The "Allocations" instrument shows memory growth over time — if total memory keeps climbing as you navigate back and forth between screens, you have a leak.
- **Android Studio Profiler → Memory** — The memory profiler shows real-time heap usage. You can force GC and then capture a heap dump. Compare two heap dumps to find objects that should have been freed. The "Allocation Tracking" feature shows where objects are being created.
- **Flipper (Memory plugin)** — Attach to the JS runtime and inspect the JS heap. Good for finding JS-side leaks (closures, event emitter references).
- **React DevTools Profiler** — While not a memory tool, it shows unnecessary re-renders that could indicate components staying mounted when they shouldn't.
- **`why-did-you-render`** — Identifies unnecessary re-renders caused by unstable references.

**Practical debugging workflow**:
1. Navigate to a screen and back several times.
2. Check if memory returns to the baseline after each navigation.
3. If it grows, take heap snapshots before and after to identify retained objects.
4. Trace back to the allocation site and add proper cleanup.

---

### Image Optimization

Strategies for handling heavy image content:

1. **Server-side resizing / CDN transforms** — Never send a 4K image to a phone screen. Use a CDN with on-the-fly transformations (Cloudinary, Imgix, Supabase Storage transforms):
   ```
   https://cdn.example.com/image.jpg?w=400&q=80&f=webp
   ```
   Request only the resolution needed for the device's screen density (`PixelRatio.get()`).

2. **Progressive loading** — Show a tiny blurred placeholder (blurhash or thumbhash) while the full image loads:
   ```tsx
   <Image source={{ uri: fullUrl }} placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }} />
   ```
   Expo's `expo-image` (the modern replacement for `<Image>`) supports blurhash natively.

3. **`expo-image` or `react-native-fast-image`** — These replace the built-in `<Image>` component with:
   - Aggressive disk + memory caching (the default `<Image>` re-downloads frequently).
   - Priority-based loading (visible images load first).
   - Preloading for upcoming items in a list.

4. **Lazy loading in lists** — Only load images for visible + nearby cells. With FlashList or FlatList's `windowSize`, off-screen images aren't loaded.

5. **Format optimization** — Use WebP (30% smaller than JPEG at same quality) or AVIF. Serve different formats based on platform support.

6. **Memory management for feeds** — For long feeds with hundreds of images:
   - Set a cache size limit (e.g., 100 MB disk, 50 MB memory).
   - Downscale images to the display size in native before decoding to full resolution.
   - For video thumbnails in lists, extract a single frame server-side rather than downloading video data.

---

## 3. Advanced State & Data Management

### Server State vs. UI State

**The core distinction**:
- **Server state** = data that lives on a remote server and your app has a *cached copy* (meetings list, user profile, transcript data). It can become stale, needs refetching, and multiple components may need the same data.
- **UI state** = data that exists only in the client (is the modal open? what's the current tab? form input values). It's never stale because the client is the source of truth.

**Why TanStack Query (React Query) over Redux for server state**:

Redux treats server data like any other state — you manually write action creators, reducers, loading/error states, cache invalidation, and refetching logic. For every API endpoint, you write ~50 lines of boilerplate.

TanStack Query handles all of this automatically:

```typescript
// This single hook replaces an entire Redux slice
const { data: meetings, isLoading, error, refetch } = useQuery({
  queryKey: ['meetings'],
  queryFn: () => supabase.from('meetings').select('*'),
  staleTime: 30_000,        // Data is "fresh" for 30s, no refetch
  gcTime: 5 * 60_000,       // Keep in cache for 5 min after unmount
  refetchOnWindowFocus: true // Refetch when app comes to foreground
});
```

**Stale-while-revalidate**: When you revisit a screen:
1. TanStack Query immediately returns the cached (possibly stale) data → the screen renders instantly.
2. In the background, it refetches from the server.
3. When fresh data arrives, it updates the UI seamlessly.
The user sees content immediately and gets updated data without a loading spinner.

**Cache invalidation**: After a mutation, you invalidate related queries:
```typescript
const mutation = useMutation({
  mutationFn: createMeeting,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['meetings'] }); // Refetches meetings list
  }
});
```

**Redux is still appropriate for**: complex client-side state machines, global UI state shared across many components (theme, auth state), or when you need time-travel debugging.

In our Meeting Notes app, we currently use a custom `useMeetings` hook with manual `useState` + `useEffect` + `supabase.from()`. Migrating to TanStack Query would give us free caching, background refresh, stale-while-revalidate, and automatic refetch on focus — replacing a lot of manual logic.

---

### Atomic State (Zustand / Jotai vs. Redux Toolkit)

**Redux Toolkit** is excellent but has inherent boilerplate: slices, reducers, selectors, `useDispatch`/`useSelector`, middleware setup, store configuration. For large teams with complex state, this structure is valuable. But for many apps, it's overkill.

**Zustand** — minimalist store-based state management:
```typescript
const useStore = create((set) => ({
  isRecording: false,
  startRecording: () => set({ isRecording: true }),
  stopRecording: () => set({ isRecording: false }),
}));

// In component:
const isRecording = useStore((state) => state.isRecording);
```
- No boilerplate, no providers, no context.
- Built-in selectors (components only re-render when their selected slice changes).
- Works outside of React (you can call `useStore.getState()` in a service file).
- Great for: medium apps, shared UI state, when you want Redux-like patterns without the ceremony.

**Jotai** — atomic (bottom-up) state:
```typescript
const isRecordingAtom = atom(false);
const recordingDurationAtom = atom(0);

// Derived atom — automatically recomputes
const recordingStatusAtom = atom((get) => {
  const isRecording = get(isRecordingAtom);
  const duration = get(recordingDurationAtom);
  return isRecording ? `Recording: ${duration}s` : 'Idle';
});
```
- Each piece of state is an independent atom — no single giant store.
- Components subscribe to only the atoms they use → minimal re-renders.
- Derived atoms compose naturally (like computed properties).
- Great for: apps where independent pieces of state are consumed by different parts of the tree, form-heavy apps, avoiding the "mega-reducer" problem.

**When to choose which**:

| Scenario | Recommendation |
|----------|---------------|
| Large team, complex business logic, need strict patterns | Redux Toolkit |
| Small-medium app, simple shared state | Zustand |
| Many independent pieces of state, derived/computed state | Jotai |
| Server-fetched data | TanStack Query (not a state manager) |

---

### Persistence Security

**`AsyncStorage` is fundamentally insecure** — it stores data as plaintext in:
- iOS: an unencrypted SQLite database in the app sandbox.
- Android: SharedPreferences (XML) or SQLite, also unencrypted.

If a device is rooted/jailbroken, or if someone has physical access, all AsyncStorage data is readable.

**Secure alternatives**:

1. **`react-native-keychain`** — stores credentials in:
   - iOS: **Keychain Services** (hardware-encrypted, optionally biometric-gated).
   - Android: **Keystore** (hardware-backed on supported devices).
   ```typescript
   import * as Keychain from 'react-native-keychain';

   // Store
   await Keychain.setGenericPassword('jwt', token, {
     accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
     accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
   });

   // Retrieve (triggers Face ID / fingerprint)
   const credentials = await Keychain.getGenericPassword();
   ```

2. **`react-native-mmkv`** with encryption — MMKV is a fast key-value store (50x faster than AsyncStorage). It supports AES-256 encryption:
   ```typescript
   const storage = new MMKV({ id: 'secure-storage', encryptionKey: 'my-secret-key' });
   storage.set('jwt', token);
   ```
   Caveat: the encryption key itself needs to be stored securely (in Keychain), otherwise you're just adding a layer of obscurity.

3. **`expo-secure-store`** (if using Expo) — wraps Keychain (iOS) and EncryptedSharedPreferences (Android):
   ```typescript
   import * as SecureStore from 'expo-secure-store';
   await SecureStore.setItemAsync('token', jwtToken);
   ```

**Best practice**: Use `expo-secure-store` or `react-native-keychain` for tokens, API keys, and any PII. Use MMKV (unencrypted) for non-sensitive caches that need speed. Use AsyncStorage only for truly non-sensitive preferences (theme, onboarding seen, etc.).

In our Meeting Notes app, we rely on Supabase's JS client which by default stores the session in `AsyncStorage`. A production upgrade would swap the storage adapter to `expo-secure-store`:
```typescript
const supabase = createClient(url, key, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
  },
});
```

---

## 4. Native Integration & DevOps

### Codegen

Codegen is a **build-time code generator** that produces type-safe C++ interfaces from a TypeScript or Flow specification.

**Why it's necessary**:

In the old architecture, native modules declared their methods in Objective-C/Java and separately in JavaScript. There was no compile-time guarantee that the JS side and Native side agreed on parameter types, return types, or method names. Mismatches caused runtime crashes.

With Codegen:

1. You write a **Spec** in TypeScript:
   ```typescript
   // NativeBatteryModule.ts
   import type { TurboModule } from 'react-native';
   import { TurboModuleRegistry } from 'react-native';

   export interface Spec extends TurboModule {
     getBatteryLevel(): number; // synchronous!
     getBatteryState(): string;
   }

   export default TurboModuleRegistry.getEnforcing<Spec>('BatteryModule');
   ```

2. At build time, Codegen reads this spec and generates:
   - **C++ abstract class** with pure virtual methods matching the spec.
   - **JNI bindings** (Android) or **ObjC++ bridge** (iOS).

3. You implement the generated interface in native code:
   ```cpp
   // Android: BatteryModule.cpp
   double BatteryModule::getBatteryLevel(jsi::Runtime &rt) {
     return getCurrentBatteryLevel(); // Native call
   }
   ```

4. If your native implementation doesn't match the spec (wrong return type, missing method), it's a **compile-time error**, not a runtime crash.

**Key benefits**:
- **Type safety across boundaries** — the spec is the single source of truth.
- **Performance** — no runtime type checking or reflection needed; the interface is pre-compiled.
- **Developer experience** — TypeScript spec gives autocomplete and type-checking on the JS side.

---

### Micro-Apps / Module Federation

For large-scale apps with multiple teams:

**Architecture approach — "Super App" / Shell + Mini-Apps**:

1. **Shell App** — owns navigation, authentication, shared services (analytics, networking, feature flags), and the app container.
2. **Mini-Apps** — each team owns one or more self-contained feature modules with their own navigation stack, state, and dependencies.

**Implementation strategies**:

- **Monorepo with package-based modules** (most practical in React Native):
  ```
  packages/
    shell/          # Main app, navigation, auth
    meetings/       # Team A's feature
    chat/           # Team B's feature
    shared-ui/      # Shared components
  ```
  Each package is a separate npm workspace. The shell imports mini-apps as packages. Build with **Turborepo** or **Nx** for incremental builds.

- **Re.Pack (Webpack for React Native)** — enables actual **Module Federation** where mini-apps are bundled independently and loaded at runtime. Team A can deploy their module without rebuilding the whole app.

- **Expo Modules** — each feature is an Expo module with its own native code, JS API, and config plugin. The shell app includes them via `expo-modules-autolinking`.

**Key concerns**:
- **Shared dependencies** — all mini-apps must use the same React / React Native version. Use peer dependencies.
- **Navigation** — the shell owns the root navigator; mini-apps export their stack/screens. Expo Router's file-based routing makes this natural with directory-based grouping.
- **State isolation** — each mini-app has its own state store. Cross-module communication goes through a shared event bus or context.
- **Independent deployability** — with Module Federation (Re.Pack), teams can deploy without waiting for each other. Without it, you use a monorepo CI that only rebuilds changed packages.

---

### Over-the-Air (OTA) Updates

**Expo Updates** (and the now-deprecated CodePush) let you push JS bundle updates directly to users' devices without going through the App Store / Google Play review process.

**How it works**:
1. You run `eas update` which uploads a new JS bundle + assets to Expo's CDN.
2. On launch, the app checks for updates, downloads the new bundle, and applies it on the next restart (or immediately depending on config).

**Benefits**:
- Fix bugs in minutes instead of waiting 1-3 days for App Store review.
- A/B test or gradually roll out changes.
- Roll back a bad release instantly.

**Risks**:
- **App Store policy violations**: Both Apple and Google allow OTA updates for **JS/interpreted code only**. You **cannot** change native code (Swift, Kotlin, native modules, permissions). Specifically:
  - Apple App Store Review Guideline 3.3.2 — downloaded code must not change the primary purpose of the app or provide features that require review.
  - Google Play Policy — similar restrictions on dynamic code loading.
  - **Violating examples**: Adding a new permission, changing the app icon, adding a new native module, introducing in-app purchases — all require a store review.
  - **Safe examples**: Fixing a typo, updating business logic, changing colors, adding a new screen that uses existing native capabilities.
- **Update failures** — if a corrupt bundle is pushed, the app could crash on launch (boot loop). Expo Updates has rollback protection: if the new bundle crashes on launch, it reverts to the previous working version.
- **Version skew** — the JS bundle may expect a native API that doesn't exist in an older native binary. Use `runtimeVersion` to ensure OTA updates only target compatible native builds.

**Best practice**: Use a `runtimeVersion` policy tied to the native build (e.g., `"runtimeVersion": { "policy": "fingerprint" }`). Each native build gets a unique fingerprint. OTA updates only apply to matching fingerprints.

---

### CI/CD for Mobile

A robust React Native CI/CD pipeline:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   PR     │───▶│  Lint +  │───▶│  Unit +  │───▶│  Build   │───▶│  E2E     │
│  Push    │    │  Type    │    │  Integ.  │    │ (EAS or  │    │  Tests   │
│          │    │  Check   │    │  Tests   │    │  Fastlane│    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │               │
                                                     ▼               ▼
                                              ┌──────────┐    ┌──────────┐
                                              │  Deploy  │    │  Deploy  │
                                              │  OTA     │    │  Store   │
                                              │ (JS only)│    │(Binaries)│
                                              └──────────┘    └──────────┘
```

**Stages**:

1. **Lint + Type Check** (fast gate, < 1 min) — `eslint`, `tsc --noEmit`. Fails fast on obvious errors.
2. **Unit + Integration Tests** — Jest for business logic, React Testing Library for component tests.
3. **Build** — **EAS Build** (Expo's cloud build service) for both iOS and Android. Alternative: **Fastlane** with self-hosted runners. Produces `.ipa` / `.aab` artifacts.
4. **E2E Tests** — Run on the built artifact against a real emulator/simulator or device farm.
5. **Deploy** — OTA for JS-only changes, Store submission for native changes.

**E2E Testing tools**:

- **Maestro** (recommended in 2026) — YAML-driven, no test code to write, record-and-playback, very fast iteration:
  ```yaml
  appId: com.lechsa.meetingnotes
  ---
  - launchApp
  - tapOn: "Email"
  - inputText: "test@test.com"
  - tapOn: "Password"
  - inputText: "test123"
  - tapOn: "Sign In"
  - assertVisible: "Start Recording"
  ```
  Simple, readable, and doesn't require test IDs (uses text/visual matching). Runs on local simulators or cloud device farms (e.g., **Robin** by mobile.dev).

- **Detox** — JS-based, gray-box testing by Wix. More powerful (can synchronize with JS bridge, wait for idle) but more complex setup. Better for flake-resistant tests of complex interactions.

**Platform-specific**:

| Concern | Solution |
|---------|----------|
| iOS code signing | EAS handles provisioning profiles; Fastlane Match for self-managed |
| Android signing | EAS stores keystores; or use Gradle signing configs |
| Versioning | Automatically bump `versionCode` / `buildNumber` per build |
| Branch strategy | `main` → production. `develop` → staging. PR builds for QA. |
| Secrets | GitHub Actions secrets or EAS Secrets for env vars |

---

## 5. Coding Challenge Themes

### 1. Custom JSI Module — Device Battery Level

```typescript
// NativeBatteryModule.ts (Codegen Spec)
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Returns the current battery level as a float between 0.0 and 1.0.
   * This is a synchronous call via JSI — no async bridge overhead.
   */
  getBatteryLevel(): number;

  /**
   * Returns battery state: 'charging' | 'unplugged' | 'full' | 'unknown'
   */
  getBatteryState(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('BatteryModule');
```

**iOS implementation sketch (Objective-C++)**:
```objc
// BatteryModule.mm
#import "BatteryModule.h"
#import <UIKit/UIKit.h>

@implementation BatteryModule

RCT_EXPORT_MODULE()

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeBatteryModuleSpecJSI>(params);
}

- (NSNumber *)getBatteryLevel {
  [UIDevice currentDevice].batteryMonitoringEnabled = YES;
  return @([UIDevice currentDevice].batteryLevel);  // 0.0 to 1.0
}

- (NSString *)getBatteryState {
  UIDeviceBatteryState state = [UIDevice currentDevice].batteryState;
  switch (state) {
    case UIDeviceBatteryStateCharging: return @"charging";
    case UIDeviceBatteryStateFull: return @"full";
    case UIDeviceBatteryStateUnplugged: return @"unplugged";
    default: return @"unknown";
  }
}
@end
```

**Usage in JS**:
```typescript
import BatteryModule from './NativeBatteryModule';

// Synchronous — returns immediately, no await needed
const level = BatteryModule.getBatteryLevel(); // 0.85
const state = BatteryModule.getBatteryState(); // "charging"
```

---

### 2. Swipe-to-Delete at 120fps with Reanimated

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';

const SWIPE_THRESHOLD = -100;

function SwipeToDeleteItem({ item, onDelete }: Props) {
  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(70);
  const opacity = useSharedValue(1);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx: { startX: number }) => {
      ctx.startX = translateX.value;
    },
    onActive: (event, ctx) => {
      // Only allow left swipe
      translateX.value = Math.min(0, ctx.startX + event.translationX);
    },
    onEnd: () => {
      if (translateX.value < SWIPE_THRESHOLD) {
        // Commit delete — animate out, then call JS callback
        translateX.value = withTiming(-400, { duration: 200 });
        itemHeight.value = withTiming(0, { duration: 300 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(onDelete)(item.id);
        });
      } else {
        // Snap back
        translateX.value = withSpring(0);
      }
    },
  });

  // All style calculations happen on UI thread — never touches JS thread
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    height: itemHeight.value,
    opacity: opacity.value,
  }));

  const deleteIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-100, -50],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View>
      {/* Red background with delete icon */}
      <Animated.View style={[styles.deleteBackground, deleteIconStyle]}>
        <Text style={styles.deleteText}>Delete</Text>
      </Animated.View>

      {/* Swipeable item */}
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={[styles.item, animatedStyle]}>
          <Text>{item.title}</Text>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}
```

**Why this maintains 120fps**:
- `useAnimatedGestureHandler` runs entirely on the **UI thread** (worklet). Finger tracking never crosses to the JS thread.
- `useAnimatedStyle` also runs on the UI thread. Style calculations happen every frame at the display's refresh rate.
- `runOnJS(onDelete)` only fires once — after the animation is committed — so the JS thread callback doesn't affect animation smoothness.
- No `setState`, no React re-renders during the gesture. React only sees the final state change.

---

### 3. Optimizing a FlatList with Video Players

**Problem**: Each list item contains a video player → dozens of active video decoders → massive memory usage + dropped frames.

**Strategy**:

```tsx
import { FlashList } from '@shopify/flash-list';
import { useCallback, useRef } from 'react';

function VideoFeed({ videos }: Props) {
  const viewableItems = useRef(new Set<string>());

  const onViewableItemsChanged = useCallback(({ viewableItems: items }) => {
    const visible = new Set(items.map((i) => i.key));
    viewableItems.current = visible;
    // Trigger re-render only for items whose visibility changed
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50, // 50% visible = "viewable"
  });

  const renderItem = useCallback(({ item }) => (
    <MemoizedVideoCard
      video={item}
      isViewable={viewableItems.current.has(item.id)}
    />
  ), []);

  return (
    <FlashList
      data={videos}
      renderItem={renderItem}
      estimatedItemSize={300}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
      // Limit windows to reduce off-screen renderers
      drawDistance={300} // FlashList equivalent of windowSize
    />
  );
}

// Memoized to prevent re-renders when scrolling
const MemoizedVideoCard = React.memo(function VideoCard({ video, isViewable }) {
  return (
    <View style={styles.card}>
      {isViewable ? (
        // Active video player — only for on-screen items
        <VideoPlayer source={{ uri: video.url }} muted autoplay />
      ) : (
        // Static thumbnail — lightweight, no decoder
        <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
      )}
      <Text>{video.title}</Text>
    </View>
  );
}, (prev, next) => {
  // Only re-render if visibility changed or data changed
  return prev.video.id === next.video.id && prev.isViewable === next.isViewable;
});
```

**Key optimizations**:

1. **Only render video players for visible items** — Off-screen items show a static thumbnail image. When an item scrolls into view (`onViewableItemsChanged`), swap the thumbnail for the video player. This limits active video decoders to 2-3 at a time.

2. **FlashList + cell recycling** — When a video card scrolls off-screen, the native view is recycled. The video player is removed and the thumbnail is re-bound. No view creation/destruction.

3. **`React.memo` with custom comparator** — Prevents React from re-rendering every item on every scroll event. Only re-renders when `isViewable` or the data changes.

4. **Flatten the component tree** — Avoid deeply nested `<View>` hierarchies inside each item. Every nested view is a native view that costs layout and render time. Use `<Text>` nesting instead of wrapping `<Text>` in `<View>`.

5. **Preload thumbnails** — Use `Image.prefetch()` for the next N items so thumbnails are ready before scrolling.

6. **Memory budget** — Set a maximum number of cached video player instances (e.g., 5). If the 6th comes into view, evict the one furthest from the viewport.

---

## 6. Hardest Technical Challenges

### Challenge 1: Background Audio Recording Surviving OS Restrictions on Both Platforms

**Context**: In our Meeting Notes app, the core feature is recording meetings in the background — the user starts a recording, locks their phone or switches to another app, and the recording must continue uninterrupted for up to 2+ hours.

**Why it was hard**:

Both iOS and Android aggressively kill background processes to save battery, and each platform has completely different mechanisms for allowing background work:

- **iOS** requires declaring a `UIBackgroundMode` of `audio` in `Info.plist`, keeping an active `AVAudioSession` with the correct category (`.playAndRecord` with `.allowBluetooth`, `.defaultToSpeaker`), and the audio session must actually be actively recording — iOS will terminate the app if it detects the background audio entitlement is being "abused" (e.g., silent audio). We also had to handle audio interruptions (phone calls, Siri, other apps taking the audio session) via `AVAudioSession.interruptionNotification` and gracefully resume recording afterward — without losing data.

- **Android** requires a `Foreground Service` with type `microphone`, a persistent notification (users can't dismiss it), and runtime permission for `FOREGROUND_SERVICE_MICROPHONE` (added in Android 14). Without the foreground service, Android kills the recording within ~60 seconds of backgrounding.

**The real complexity** was that Expo doesn't have a built-in config plugin for this. We had to write a **custom Expo config plugin** (`plugins/withBackgroundAudio`) that programmatically modifies:
- `Info.plist` — injects `UIBackgroundModes: ["audio"]`
- `AndroidManifest.xml` — adds `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` permissions and declares the service
- `AppDelegate.swift` — configures the `AVAudioSession` category at app launch

The hardest debugging moment was a bug where recording silently stopped after ~10 minutes on certain Android devices (Samsung, Xiaomi) due to manufacturer-specific battery optimization that kills foreground services. The fix required guiding users to disable battery optimization for our app, and implementing a watchdog timer that detected when the recording stream went silent and re-initialized it.

**Lesson**: Cross-platform "background" work is one of the hardest problems in mobile development because you're fighting the OS, and every device manufacturer adds their own restrictions on top. There's no "write once" solution — you must deeply understand both platform lifecycles.

---

### Challenge 2: Race Conditions in Concurrent React State Updates During Async Flows

**Context**: In a previous fintech project, we had a payment flow with multiple concurrent async operations: form validation (debounced API call to verify bank account), real-time exchange rate polling (WebSocket), balance check, and biometric authentication — all updating shared state and conditionally enabling a "Confirm" button.

**Why it was hard**:

The bug manifested as the "Confirm" button being enabled when it shouldn't be — a user could submit a payment with a stale exchange rate or an unverified account. The root cause was a class of bugs that's extremely common in React but rarely discussed:

1. **Stale closures** — `useEffect` callbacks captured old state values. The exchange rate WebSocket handler was reading a stale `formState` because it closed over the initial render's state. It would set `canSubmit: true` based on outdated validation results.

2. **Interleaved state updates** — React batches state updates within event handlers, but async callbacks (WebSocket `onmessage`, `setTimeout`, Promise `.then()`) were *not batched* in React 17 (this was pre-React 18's automatic batching). So three `setState` calls from three async sources would trigger three separate re-renders, each with partially updated state.

3. **Out-of-order responses** — The debounced account validation API call took 200-800ms. If the user typed quickly, call A (for account "123") could return *after* call B (for account "1234"), overwriting the correct validation result with a stale one.

**How I solved it**:

- **`useRef` for mutable latest values** — stored the latest form state in a ref so async callbacks always read current values without re-subscribing:
  ```typescript
  const stateRef = useRef(formState);
  stateRef.current = formState; // Updated every render
  // In WebSocket handler: use stateRef.current, not formState
  ```

- **Abort controllers for racing requests** — each validation call got an `AbortController`. When a new call started, the previous one was aborted:
  ```typescript
  const controllerRef = useRef<AbortController>();
  const validate = async (account: string) => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const result = await api.validate(account, { signal: controllerRef.current.signal });
    // Only reaches here if not aborted
  };
  ```

- **Migrated to `useReducer`** — consolidated all related state into a single reducer. This eliminated interleaved partial updates — every state transition was atomic and explicit:
  ```typescript
  dispatch({ type: 'RATE_UPDATED', rate: newRate });
  dispatch({ type: 'VALIDATION_COMPLETE', valid: true });
  // Each dispatch produces a consistent state snapshot
  ```

- **Upgraded to React 18** — automatic batching fixed the multiple-re-render problem for async callbacks.

**Lesson**: React's mental model of "state is a snapshot" breaks down when you have multiple concurrent async producers updating related state. `useReducer` + refs + abort controllers is the pattern for complex async flows. This is also why TanStack Query exists — it solves the racing/stale/caching problem for server state so you don't have to.

---

### Challenge 3: Debugging a Memory Leak Caused by Invisible Notification Listener Accumulation

**Context**: In our Meeting Notes app, users reported the app becoming progressively slower and eventually crashing after being open for extended periods (during long meetings). Memory usage climbed from ~80 MB to 400+ MB over 2 hours.

**Why it was hard**:

The leak wasn't in an obvious place — no large arrays growing unbounded, no forgotten `setInterval`. Xcode Instruments showed a steady accumulation of `JSValue` and `RCTBridge` callback objects, but the stack traces pointed deep into React Native internals, not our code.

After hours of bisecting, the root cause was **notification listeners being registered multiple times without cleanup**. The flow:

1. Our root `_layout.tsx` registered `Notifications.addNotificationReceivedListener()` and `Notifications.addNotificationResponseReceivedListener()` in a `useEffect`.
2. We had the cleanup function (`return () => { sub.remove(); }`), so it seemed correct.
3. But the root layout was **re-mounting** due to Expo Router's authentication redirect pattern. When a user logged in, the layout tree restructured, causing the root layout to unmount and remount. Each mount registered new listeners. The `remove()` call fired on unmount, but due to a subtle timing issue with Expo Notifications' internal listener registry, the native-side listener wasn't actually removed — the JS subscription was disposed, but the native module kept a reference to the callback.
4. Every time a push notification arrived (we poll status during recording), it fired N accumulated native callbacks → N JS invocations → N unnecessary re-renders and state updates.

**How I solved it**:

- **Xcode Instruments (Allocations)** — Used the "Mark Generation" feature. Before each login/logout cycle, I marked a generation. After the cycle, I compared allocations — saw `ExpoNotificationsListener` objects accumulating across generations.

- **Added a guard** — moved the listener registration to a singleton pattern outside of React's lifecycle:
  ```typescript
  // services/notifications.ts
  let foregroundSub: Subscription | null = null;
  let responseSub: Subscription | null = null;

  export function registerNotificationListeners(router: Router) {
    // Remove existing before registering new
    foregroundSub?.remove();
    responseSub?.remove();
    
    foregroundSub = Notifications.addNotificationReceivedListener(...);
    responseSub = Notifications.addNotificationResponseReceivedListener(...);
  }

  export function removeNotificationListeners() {
    foregroundSub?.remove();
    responseSub?.remove();
    foregroundSub = null;
    responseSub = null;
  }
  ```

- **Verified with Instruments** — after the fix, memory stabilized at ~90 MB regardless of how long the app ran or how many login cycles occurred.

**Lesson**: Memory leaks in React Native are often at the boundary between JS and Native. React's `useEffect` cleanup is not always sufficient when native modules maintain their own listener registries. The debugging process requires platform-native tools (Instruments, Android Profiler) — you can't find these leaks with JS-only tooling. Also, be very careful with event listeners in components that can remount (auth gates, navigation resets).
