# Android Home-Screen Widget Contract

## Scenario: showing the next class on the Android launcher

### 1. Scope / Trigger

Use this contract when changing the Android App Widget, the `WidgetSnapshot` Capacitor bridge, the Web-side snapshot builder, the widget refresh scheduling, or anything that reads/writes the snapshot preference file. The widget is Android-only; browser/PWA and the native import shell must stay untouched and unaffected.

The core constraint that shapes everything here: **course data lives only in the WebView's `localStorage`** (Zustand persist, key `class-track-storage`). A widget runs in the app's own process and cannot read WebView storage, so a one-way snapshot channel is the only data path. The Web layer is the single source of truth for every calendar and timezone computation; native only compares `long` epochs and renders.

### 2. Signatures

Web → native boundary, registered as `WidgetSnapshot`:

```ts
interface WidgetSnapshotPlugin {
  pushSnapshot(options: { snapshotJson: string }): Promise<void>
  consumePendingRoute(): Promise<{ route: string | null }>
  getExactAlarmStatus(): Promise<{ available: boolean; exact: boolean }>
  requestExactAlarmPermission(): Promise<{ launched: boolean; exact: boolean }>
  addListener(eventName: 'resumed', listenerFunc: () => void): Promise<PluginListenerHandle>
}

function isNativeWidgetSnapshotAvailable(): boolean // android && plugin registered
```

The frozen cross-layer payload (Web builds it, native consumes it):

```ts
type WidgetSnapshotV1 = {
  schemaVersion: 1
  status: 'ok' | 'empty' | 'unavailable'
  generatedAtEpochMs: number
  validUntilEpochMs: number
  entries: WidgetOccurrence[]   // ascending by startEpochMs, max 800
  dayEndEpochMs: number[]       // index = dayOffset, value = local 24:00 of that day
  generatedAt: string           // diagnostic only
  timezone: string              // diagnostic only
}

type WidgetOccurrence = {
  id: string        // `${class.id}#${dayKey}`
  name: string
  classroom: string
  sections: string  // "3-4" or "3"
  startEpochMs: number
  endEpochMs: number
  startLabel: string // "10:00", pre-formatted by Web
  endLabel: string
  dayKey: string     // "2026-09-19"
  dayOffset: number  // 0 = the day the snapshot was generated
  weekdayLabel: string
}
```

Native surface that future work must reuse rather than re-derive:

```java
// all refresh paths converge here; it is idempotent
WidgetRefreshController.refresh(context, trigger)      // render + reschedule
WidgetRefreshController.rescheduleOnly(context, trigger) // reschedule only (receiver.onUpdate)

// the ONLY Java -> Kotlin call site in this feature
WidgetRefreshBridge.requestRefresh(context)

WidgetDisplayState.Type = { MISSING, UNAVAILABLE, EMPTY, STALE, NO_UPCOMING, READY }
WidgetStateResolver.resolve(WidgetSnapshot, nowEpochMs)
```

### 3. Contracts

- **Storage**: `SharedPreferences("class-track-widget", MODE_PRIVATE)`, single key `snapshot_json`, written with one `commit()`. One key means a reader can never observe a half-updated snapshot. `apply()` must not be used: the plugin may only `resolve()` after confirming the write landed.
- **Bounded payload**: 256 KiB and ≤ 800 entries. The Web side measures UTF-8 bytes via `TextEncoder` (not `String.length`, which under-counts Chinese by 2×) and skips the push rather than sending a payload native will reject.
- **Coverage window**: from the generation day to the last day of the semester's last week, clamped to at least the generation day, capped at 400 days and 800 entries. When the entry cap truncates the window, `validUntilEpochMs` and `dayEndEpochMs` shrink with it — a day must never be listed as covered while its courses were dropped, or the widget would silently render "no class today".
- **`dayEndEpochMs[dayOffset]` is the only way native determines "what day is it"**. This removes all date/timezone math from native: no `java.time`, no `Calendar`, no `SimpleDateFormat`, no desugaring.
- **`status` distinguishes three kinds of "nothing to show"**: `empty` (no courses imported), `unavailable` (no `firstWeekStartDate`, so dates cannot be derived — never guess "week N + today"), `ok`. `schemaVersion` mismatch is treated as no snapshot; the stored file is kept, nothing throws.
- **Hero selection is `endEpochMs > now`, never `startEpochMs > now`.** A class that already started but has not ended is still the hero (labelled "in progress"). Only when no entry has `endEpochMs > now` may the widget show "no class".
- **`READY` vs `NO_UPCOMING` vs `EMPTY` must stay distinct**: a valid snapshot with no unfinished course means "the semester is over", which is a different message from "no timetable data". Merging them makes the widget tell users their data is missing when the term simply ended.
- **Five-tier refresh ladder**, all converging on one idempotent path:
  - **L1** plugin push (immediate render + a 0-delay unique Work as a persisted fallback).
  - **L2** `ACTION_DATE_CHANGED` / `ACTION_TIME_SET` / `ACTION_TIMEZONE_CHANGED` declared on a manifest receiver. These are on Android 8+ implicit-broadcast exception list, so they are delivered regardless of `targetSdk`; midnight and time changes are corrected exactly, with zero permissions.
  - **L3** `AlarmManager.setExactAndAllowWhileIdle`, gated behind `canScheduleExactAlarms()`. This is the **user-optional** tier: `SCHEDULE_EXACT_ALARM` is a special app access that Android 14+ denies by default. Without it the widget silently falls back to L4 — never crash, never show an error. Do not declare `USE_EXACT_ALARM` (that one is auto-granted and reserved for alarm/calendar apps).
  - **L4** `OneTimeWorkRequest` with `setInitialDelay(nextBoundary - now)`, `ExistingWorkPolicy.REPLACE`, unique name `widget-boundary-refresh`.
  - **L5** `appwidget-provider` `updatePeriodMillis="1800000"` (the AOSP `MIN_UPDATE_PERIOD` floor). Delivered by the system's own alarm, independent of WorkManager and of whether our process was pre-warmed. **Never set it to 0.**
- **Do not add a `PeriodicWorkRequest`**: L5 is the more independent, cheaper periodic path. Do not add a `BOOT_COMPLETED` receiver either: WorkManager reschedules its own work after reboot. Note that `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `FOREGROUND_SERVICE` and `ACCESS_NETWORK_STATE` appear in the merged manifest from `androidx.work`'s library manifest — that is a merge fact, not a declaration of ours. L3 alarms do **not** survive reboot, which is a documented limitation, not a bug.
- **Java ↔ Kotlin boundary is exactly one call**: `WidgetRefreshBridge.requestRefresh(Context)`. The Capacitor plugin stays Java (same shape as `CourseImportPlugin`); Glance must be Kotlin. Keep the surface at "one static method, one Context argument, no return value".
- **Privacy**: the snapshot carries only what is displayed. Teacher, `courseId`, `classId`, notes, URLs and cookies must never cross the bridge. Diagnostics use one tag (`ClassTrack.Widget`) and emit only a phase, a byte length, and whitelisted enum values — never a course name, classroom, time, or payload text.
- **`initialLayout` must use only RemoteViews-allowed classes.** The `appwidget-provider` `initialLayout` is inflated by the *host* as a legacy RemoteViews layout, so it accepts only annotated classes (`FrameLayout`, `LinearLayout`, `TextView`, `ImageView`, ...). A bare `<View>` throws `InflateException: Class not allowed to be inflated android.view.View` and the launcher renders "Can't load widget". Keep it to a single background-carrying container with no children.
- **Never call `goAsync()` from `AppWidgetProvider` callbacks.** In `onUpdate` / `onEnabled` / `onAppWidgetOptionsChanged` it can return `null`; calling `pending.finish()` then throws an NPE that kills the process — and a process killed mid-update leaves the widget stuck on `initialLayout`, i.e. a blank card. Those callbacks only need to keep the boundary chain alive, so enqueue durable WorkManager work instead. In a real `onReceive`, `goAsync()` is valid but must still be null-checked.
- **The widget's click route must be a route that actually exists.** The schedule page is the *index* route (`/`), not `/schedule`. A route that matches nothing makes React Router render `root.tsx`'s `ErrorBoundary`, which **replaces the whole component tree and unmounts the snapshot-sync component** — so a bad click route also silently stops sync. Guard the constant with a `matchRoutes(routes, ROUTE)` test, the same pattern as `native-shell-url.test.ts`.
- **Widget click**: starts `MainActivity` with extra `classtrack_widget_route`. The route is whitelisted to the compile-time constant `/` (`WidgetPendingRoute.ROUTE_SCHEDULE`, the *index* route — see the guard bullet above), so a foreign app cannot inject an arbitrary path into client-side navigation, and the Intent carries no course data.
- **Per-instance style config** (added 2026-09-19 requirement change): layout style (`day_list` / `next_up` / `compact`) and finished-class policy (`show_dim` / `hide` / `collapse`) are stored **per widget instance** in the Glance state container (`updateAppWidgetState` / `getAppWidgetState` + `PreferencesGlanceStateDefinition`, keys `layout_style` / `finished_policy`). Unknown or corrupt values fall back to `day_list` + `show_dim`; never throw, never blank the widget. The mapping is `GlanceAppWidgetManager.getAppWidgetId(glanceId)` / `getGlanceIdBy(appWidgetId)`. `onDeleted` clears the instance's keys so a reused `appWidgetId` cannot inherit a previous style.
- **`WidgetConfigActivity` is exported and therefore an attack surface**: it must treat `EXTRA_APPWIDGET_ID` as untrusted input — verify `AppWidgetManager.getAppWidgetInfo(id)` exists and its `provider` equals `ClassTrackWidgetReceiver`, otherwise `setResult(RESULT_CANCELED)` + `finish()` with no writes and no logged payload. The page renders **no course data at all** (only style names and static mocks). The provider declares `android:configure="...WidgetConfigActivity"` and `android:widgetFeatures="reconfigurable"` for the placement-time and long-press paths.
- **Three layout styles, chosen per instance** (R1/R8): `day_list` (summary row `今天 周六 · 共 N 节` + full-day list, in-progress row highlighted, finished per policy), `next_up` (hero card + the same list), `compact` (hero only + `今天还有 N 节`). The list is a real scrollable widget list: `androidx.glance.appwidget.lazy.LazyColumn` + `ColumnScope.defaultWeight()` — the single `@OptIn(ExperimentalGlanceApi::class)` in the feature (see design-appendix D15 and the `prd.md` constraint). Rare launchers that cannot host collection widgets should fall back to height-truncated rows with a `+N` trailer, per design D15.
- **Rendering must always read the latest resolved state (`WidgetRenderCache`)**: Glance invokes `provideGlance` only once per session; `update`/`updateAll` re-compose `provideContent` with the captured closure. If the composition reads the captured `state`, a time change or new snapshot pushes a refresh yet the pixels stay on the previous frame (device-reproduced defect, fixed 2026-09-19). Every refresh path converges on `WidgetRefreshController.resolveCurrentState`, which publishes the result into `WidgetRenderCache` (a process-local Compose `mutableStateOf`, written under `Snapshot.withMutableSnapshot`); `provideContent` reads `WidgetRenderCache.latest()` with the `provideGlance` result as fallback for the very first render.
- **The day-list phase model (R9)**: the resolver marks every today entry `FINISHED` / `IN_PROGRESS` / `UPCOMING` and exposes counts (`todayRemainingCount`, `todayFinishedCount`). The three finished policies (`show_dim` / `hide` / `collapse`) are a pure Java function (`WidgetDayListPolicy`) so they are JUnit-tested; the renderer only draws what the policy returns. The `compact` style renders no list, so the finished-policy is disabled in the config UI with an explanatory note (honesty requirement).
- **Preview (R10)**: the provider declares `android:previewLayout` (static RemoteViews mock of the default style, whitelisted classes only) for Android 12+ pickers and `android:previewImage="@drawable/widget_preview"` (generated by `scripts/generate-widget-preview.py`, not the app icon) for older launchers. The three config-page thumbnails (`widget_preview_day_list/next_up/compact`) are static mocks that must be kept in sync with the real styles — drift is a documented residual risk, checked against device screenshots in the task's `verification.md`.
- **Browser/PWA isolation is load-bearing**: `Capacitor.isPluginAvailable('WidgetSnapshot')` returns **true on the web** because our own `WebPlugin` fallback registers it. Therefore the guard must be `Capacitor.getPlatform() === 'android' && isPluginAvailable(...)`. Dropping the platform check sends browsers down the real sync path.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Browser / PWA / iOS, or plugin missing | Whole feature is a no-op. Sync hook returns early, settings card renders nothing, no bridge call, no console error. |
| `snapshotJson` missing/empty | Reject `INVALID_PAYLOAD`; do not write. |
| Payload > 256 KiB | Reject `PAYLOAD_TOO_LARGE` without writing; Web side should have self-checked first. |
| Not valid JSON / `schemaVersion !== 1` / unknown `status` / `entries` or `dayEndEpochMs` not arrays / > 800 entries | Reject `INVALID_PAYLOAD`; do not write. |
| One entry has a missing or mistyped field | Skip that entry only; the rest of the snapshot stays usable. Native never fails a whole snapshot because of one bad row. |
| `commit()` returns false | Reject `STORAGE_ERROR`; never `resolve()` a write that did not land. |
| Stored snapshot absent | `MISSING` → widget prompts the user to open the app once. |
| `now > validUntilEpochMs`, or no day in `dayEndEpochMs` contains `now`, or `now < generatedAtEpochMs - 6h` (clock rollback) | `STALE` → prompt to re-sync. Never guess a course. |
| Snapshot valid but no `endEpochMs > now` | `NO_UPCOMING` → "semester finished", not "no data". |
| Exact-alarm permission missing or revoked | Skip L3 silently, keep L4/L5 working. `SecurityException` from `setExactAndAllowWhileIdle` must be caught. |
| Render throws inside a broadcast receiver path | Catch it, log a phase, keep the process alive; the next scheduled boundary retries. |

### 5. Good / Base / Bad Cases

- **Good**: the user imports a timetable, the Web layer builds a snapshot covering the rest of the semester and pushes it once; the widget immediately shows the next class, then switches at each class boundary for the following weeks even if the app is never opened again.
- **Base**: the app was never opened → the widget shows "open ClassTrack to sync", which is honest rather than an empty card. A browser user sees no widget UI at all.
- **Bad**: native re-derives "which week is it" from `currentWeek` and the device clock (two sources of truth that drift); the widget shows "no class today" for a day whose courses were dropped by truncation; or the exact-alarm path throws `SecurityException` on a device where the permission was revoked mid-flight.

### 6. Tests Required

- **Web (vitest, `app/lib/widget-snapshot.test.ts`)**: normal teaching day; in-progress class retained; today's classes all finished; weekend; `firstWeekStartDate` missing/invalid (`''`, `2026-9-7`, `2026-02-30`); week-boundary rollover; entry-cap truncation shrinking `validUntilEpochMs` together with `dayEndEpochMs`; snapshot size well under the cap for a 20-week term; 42-day-later lookup; cross-module consistency with `features/schedule`'s `getMaxWeek` and `dayNames`.
- **Native pure logic (`WidgetSnapshotParserTest`, `WidgetStateResolverTest`)**: parser rejects malformed/short/oversized/wrong-version payloads and skips only the corrupt entry; resolver covers `MISSING`/`UNAVAILABLE`/`EMPTY`/`STALE`/`NO_UPCOMING`; boundary selection; the "adjacent classes switch exactly at the shared boundary" case; and that a class with `start < now < end` stays the hero with `IN_PROGRESS`.
- **Cross-layer (`WidgetSnapshotCrossLayerTest`)**: feed a fixture produced by the real Web builder into the native parser and resolver. Assert the right course is selected 42 days later with zero renders in between, the window end behaves, sensitive sentinel values never appear in the payload, and `dayOffset`/`dayEndEpochMs` semantics agree. Fixture: `android/app/src/test/resources/widget-snapshot-v1.json`. Assertions must derive their timestamps **from the snapshot** — never hardcode epochs, since a fixture generated in UTC+8 has different absolute values than one generated in UTC.
- **Device (not runnable in a KVM-less sandbox)**: placing the widget, 4x2 vs 2x1 layout, dark/light, click-through, time-change broadcasts actually arriving, exact-alarm behaviour after grant/revoke, reboot resilience, and a long-run "never open the app" check. Record the exact blocker rather than claiming these; see `.trellis/tasks/*/verification.md` for the pattern.

### 7. Wrong vs Correct

#### Wrong

```kotlin
// Native only has epoch longs and a day-index list. Deriving a calendar date here
// reintroduces timezone bugs and a second source of truth.
val calendar = Calendar.getInstance().apply { timeInMillis = entry.startEpochMs }
val day = calendar.get(Calendar.DAY_OF_MONTH)
```

```ts
// isPluginAvailable is true on the web because our WebPlugin fallback registers it.
if (Capacitor.isPluginAvailable('WidgetSnapshot')) pushSnapshot(...)
```

#### Correct

```kotlin
// "What day is it" comes from the snapshot itself: the first day whose end is still ahead.
val currentDayOffset = snapshot.dayEndEpochMs.indexOfFirst { it > nowEpochMs }
val hero = snapshot.entries.firstOrNull { it.endEpochMs > nowEpochMs }
```

```ts
export function isNativeWidgetSnapshotAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('WidgetSnapshot')
}
```
