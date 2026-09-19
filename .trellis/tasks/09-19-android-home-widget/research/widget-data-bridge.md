# Widget data bridge findings

## Process/storage boundary

- A normal `GlanceAppWidgetReceiver` runs in the app's own process/application UID (unless a separate process is explicitly configured), so it can read the same app-private `SharedPreferences` as the Capacitor plugin. It cannot read WebView localStorage directly: localStorage lives inside Chromium/WebView storage, not Android preferences.
- `@capacitor/preferences` is not installed in this repository (`package.json` has `@capacitor/filesystem` and `@capacitor/share`, but no preferences dependency). Adding it solely for this bridge would add a JS/native plugin layer; plain app-private `SharedPreferences` in a purpose-built plugin is smaller and avoids a second serialization contract.
- Recommended preference name: a dedicated file such as `class-track-widget`; key `snapshot_json`. Keep it separate from Capacitor/WebView preferences so schema ownership is clear. Use a compact versioned JSON object, for example:
  ```json
  {
    "schemaVersion": 1,
    "generatedAt": "2026-09-19T08:10:00Z",
    "timezone": "Asia/Shanghai",
    "today": "2026-09-19",
    "next": {"id":"...","name":"...","start":"2026-09-19T10:00:00+08:00","end":"2026-09-19T11:40:00+08:00","classroom":"...","sections":"3-4"},
    "remaining": [],
    "status": "ok"
  }
  ```
  JS should resolve next-N occurrences and absolute start/end timestamps; native only compares them to Android's current clock, chooses in-progress/upcoming position, and schedules the next boundary.
- Enforce bounded payload size and validate required fields/version before writing. One JSON string write is atomic at the preference-file level from readers' perspective when using `commit()`; use `commit()` if the plugin must guarantee data is durable before requesting refresh, or `apply()` only when a later update can safely tolerate a short write delay. Do not write multiple keys that can produce a mixed snapshot.

## Capacitor plugin flow

1. Web plugin interface follows `app/lib/native-course-import.ts`: `registerPlugin`, typed options/error handling, and a WebPlugin fallback. Expose `pushSnapshot({ snapshotJson })` and return a small success object (`storedAt`/`schemaVersion`) or resolve void.
2. Android `SnapshotPlugin extends Plugin`, annotated `@CapacitorPlugin(name = "WidgetSnapshot")`, validates `PluginCall.getString("snapshotJson")`, parses with `org.json.JSONObject`/a dedicated validator, and writes `getContext().getSharedPreferences("class-track-widget", Context.MODE_PRIVATE)`.
3. After a successful write, trigger all widget instances. A Java plugin should preferably send an explicit app-internal broadcast (e.g. `com.classtrack.app.action.WIDGET_SNAPSHOT_CHANGED`) to a declared/non-exported receiver; the receiver can call a Kotlin `@JvmStatic` updater. This avoids Java directly invoking Glance's suspend `updateAll` API. Alternatively expose a Kotlin `object WidgetUpdater { @JvmStatic fun requestUpdate(context: Context) { ... } }` and bridge coroutine dispatch explicitly.
4. `PluginCall.resolve(JSObject)`/`call.reject(message, code)` are the established repo pattern (`CourseImportPlugin.java:20-145`). Reject malformed JSON, too-large payload, unavailable widget update, or storage errors with stable codes; do not silently report success after a failed `commit()`.
5. The widget receiver also receives normal `APPWIDGET_UPDATE` lifecycle broadcasts. It should read the latest snapshot and call `ClassTrackWidget.updateAll(context)`; update callbacks should be idempotent and safe when no widget instances exist.

## Time and timezone correctness

- `java.time` is available on API 26+, while project minSdk is 24. To use `java.time` on 24/25, add core library desugaring in `android/app/build.gradle` (`compileOptions { coreLibraryDesugaringEnabled true; sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }` or the project-supported Java level, plus `coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:<verified-version>"`). Verify the exact desugar library against AGP 8.13/compileSdk 36 before implementation.
- Prefer JS to construct the occurrence's absolute offset-bearing ISO strings using the device's local timezone and include `timezone`/`generatedAt`. Android parses with `OffsetDateTime`/`Instant` and compares `Instant.now()`; it must not recompute a date from UTC midnight or from the stale persisted `currentWeek`.
- JS currently uses `new Date(firstWeekStartDate)` in `getDayDate`/`getCurrentWeek`, which can produce date-only UTC interpretation differences. The new bridge should use a local-date constructor for `YYYY-MM-DD`, calculate occurrence dates in the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`, and send the resulting offset. Native can still use its own clock for “now”; large device clock skew is an unavoidable limitation and should be reflected by `generatedAt`/staleness diagnostics.

## Snapshot selection/staleness policy

- `generatedAt` should be checked against a conservative TTL (for example 24–48 hours, or until the next known occurrence). If too old, render “请打开 ClassTrack 刷新课表” rather than presenting a confidently wrong class; still show cached data only if its timestamps are individually parseable.
- If no snapshot exists (never opened, plugin never called, or app data was not initialized), render an empty/setup state with a click action opening the app. Do not attempt to access localStorage or guess from class times.
- For a holiday/no-class day, `next` can point to the next future occurrence while `remaining` is empty; the UI should label it “今日无课” and optionally show the next class date. If the agreed product semantics mean “next upcoming” can cross days, preserve an explicit `next.date`/`isToday` field.
- At every update, filter/position using `start` and `end`: in-progress class is the prominent current/next item; otherwise choose the first future start. Remove completed occurrences from today's remaining list. Recompute after each scheduled boundary and on foreground.
- Handle malformed/unknown schema as empty/stale, log diagnostics without exposing course payload, and retain the last valid snapshot only if its own freshness policy permits.

## Refresh scheduling recommendation

- Immediate: plugin write followed by receiver broadcast/update-all.
- Foreground: web app listens to Capacitor App `appStateChange` (or document visibility as web fallback) and pushes a fresh computed snapshot; the current repo has no such listener yet.
- Boundary: native schedules one next boundary from the stored absolute timestamps. Prefer inexact `AlarmManager.set` or one-off WorkManager to avoid exact-alarm permission. On alarm/broadcast, read snapshot, recompute position, update, then schedule the following boundary. WorkManager periodic (15 min minimum and inexact) is only a safety refresh.
- If product truly requires ±1 minute through Doze, `setExactAndAllowWhileIdle` plus Android 12+ exact-alarm permission/access is required, with special handling for permission denial, reboot, timezone/date changes, and OEM battery restrictions. This is a significant policy/UX cost; default to least-permission inexact scheduling and immediate/foreground pushes.

## Bridge caveats

- SharedPreferences is app-private and survives WebView recreation, but is not a multi-process database. Do not configure the widget receiver in a different process unless storage synchronization is redesigned.
- A broadcast receiver may be invoked when the process is cold. Keep receiver work short, enqueue Glance update on the supported coroutine/background path, and never assume `MainActivity` or a Capacitor `Bridge` exists.
- Test JSON validation, occurrence ordering, timezone/date-only conversion, stale/no-data/no-class states, and boundary selection with pure JUnit tests. Test actual receiver/Glance update, launcher resizing, dark mode, and cold-start behavior on an Android device/emulator.
