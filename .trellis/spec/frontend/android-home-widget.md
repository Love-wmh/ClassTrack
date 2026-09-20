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
- **Per-instance style config** (added 2026-09-19 requirement change): layout style (`day_list` / `next_up` / `compact`) and finished-class policy (`show_dim` / `hide` / `collapse`) are stored **per widget instance** in the Glance state container (`updateAppWidgetState` / `getAppWidgetState` + `PreferencesGlanceStateDefinition`, keys `layout_style` / `finished_policy`). Unknown or corrupt values fall back to the defaults (`WidgetStyleConfig.DEFAULT_LAYOUT_STYLE` / `DEFAULT_FINISHED_POLICY`, currently `next_up` + `show_dim`); never throw, never blank the widget. The default layout style is **「接下来」(next_up)** because it answers both 「现在上什么」 and 「今天还有什么」 without the user having to configure anything at placement time (changed 2026-09-20 from `day_list`, per the product owner). A third per-instance group, **大格子表现** (`wide_layout`: `adaptive` / `dense` / `two_column`, `WidgetStyleConfig.WideLayout`, added 2026-09-20), follows the same read/fallback/write/clear path: `adaptive` (default) follows the size, `dense` additionally shows section numbers and today's counts, `two_column` splits the body when the geometry allows it. `WidgetStyleState.clear()` must delete all three keys — a reused `appWidgetId` would otherwise inherit a stale layout. The mapping is `GlanceAppWidgetManager.getAppWidgetId(glanceId)` / `getGlanceIdBy(appWidgetId)`. `onDeleted` clears the instance's keys so a reused `appWidgetId` cannot inherit a previous style.
- **`WidgetConfigActivity` is exported and therefore an attack surface**: it must treat `EXTRA_APPWIDGET_ID` as untrusted input — verify `AppWidgetManager.getAppWidgetInfo(id)` exists and its `provider` equals `ClassTrackWidgetReceiver`, otherwise `setResult(RESULT_CANCELED)` + `finish()` with no writes and no logged payload. It accepts no URL/file/payload extras, and its diagnostics log only a phase plus a whitelisted reason. The provider declares `android:configure="...WidgetConfigActivity"` and `android:widgetFeatures="reconfigurable"` for the placement-time and long-press paths.
- **The config page renders real course data, and that is an accepted residual risk** (changed 2026-09-19 after device review): the style thumbnails are real Glance compositions of the live schedule (see the preview bullet), so anyone who can start this exported Activity with a valid `appWidgetId` can see the user's timetable. The previous design avoided the entire class of problems by rendering no data; **the product owner replaced that boundary with WYSIWYG previews** after the static mocks were found to misrepresent the real widget. Keep the mitigations that remain (id-ownership check, no payload extras, payload-free logs) and do not add further data to this page without re-deciding the boundary. Do not "fix" this by whitelisting launcher package names — the configure Intent only carries an id, and launcher package names are not a verifiable trust anchor.
- **Three layout styles, chosen per instance** (R1/R8): `day_list` (summary row `今天 周六 · 共 N 节` + full-day list, in-progress row highlighted, finished per policy), `next_up` (hero card + the same list), `compact` (hero only + `今天还有 N 节`).
- **The widget is responsive by construction, not by size buckets** (changed 2026-09-19, **narrowed 2026-09-20**): `sizeMode` is `SizeMode.Exact`, so `LocalSize` is the host cell's real size and the layout adapts to any size the user drags the widget to. Do **not** reintroduce `SizeMode.Responsive(declaredSizes)` or any `if (height < N.dp)` threshold: declared size buckets make the composed layout depend on which bucket the host picked, which broke both the real widget and the config-page preview. The 2026-09-20 narrowing separates two things the old wording ran together — **still forbidden**: size *buckets*, and any size *threshold* that decides whether a block is shown or which day/rows the list reads. **Now allowed**: deriving the metrics (font sizes, paddings, row gaps, column widths, corner radius) from `LocalSize` through one **continuous** function, `WidgetLayoutMetrics.resolve(w, h)` = `clamp(min(w / W_REF, h / H_REF), 1.0, 2.0)` with `padScale = sqrt(scale)`, pinned by `WidgetLayoutMetricsTest`. The lower bound is `1.0` on purpose: the pre-change literals are the values already validated on small cells, so `scale = 1` reproduces them exactly and every existing phone size stays pixel-identical. Also allowed: splitting the body into two columns **only** when the user picked 「双栏」 *and* the geometry permits it (`width >= 320dp && width >= height * 1.25`, both layout-feasibility floors, not content-visibility thresholds) — both arrangements render the **same line sequence**, so nothing can drift between the widget, the preview and the picker. The whole card shares **one** scroll axis — hero, summary row and course rows are items of the same `LazyColumn` (`ColumnScope.defaultWeight()`), so nothing stays pinned while the inside scrolls. Vertical breathing room is the list's first/last item, not the card's `padding`: padding on the card stays fixed during scrolling and reads as a permanent white strip at the top.
- **Clicks must be attached to the scroll container *and* to every list item** (device-reproduced regression, 2026-09-20): `LazyColumn` compiles down to a `ListView` inside the RemoteViews collection, and that `ListView` covers nearly the whole card. `AbsListView` consumes the touch stream for its own scrolling, so a `clickable` on the outer root column never fires — tapping the card silently did nothing and the app could not be opened. `WidgetBody` therefore puts the same `actionStartActivity(...)` on the `LazyColumn` modifier, on each item's `Box`, and on the two vertical spacing items (which cover the padding and any blank area below the content). Item-level clicks are the standard collection-widget pattern; keep them when touching this layout.
- **The collection `ListView`'s scrollbar is disabled by overriding Glance's layout resource**: `android/app/src/main/res/layout/glance_list.xml` is a verbatim copy of `glance-appwidget-1.2.0`'s (Apache-2.0) `glance_list.xml` plus `android:scrollbars="none"`. The platform default draws a vertical scrollbar that fades in over the right edge of the course rows while dragging; it has no navigation value in a card with a handful of rows and only covers the room column. **App-side resources override library resources of the same name**, which is what makes this work; the file is version-coupled to the Glance artifact, so re-diff it against the AAR on every Glance upgrade.
- **The two-column body keeps one line sequence, and its left card is the only "sub-card"** (added 2026-09-20): `DualColumnBody` renders the *same* `WidgetBodyPlan` lines the single-column path renders — the hero line moves into a left card, the remaining lines go into the right column's `LazyColumn`; nothing is added or dropped (design D11). The left card is the **only** place that draws an inner surface with a fixed row structure, and it fills its column (`fillMaxHeight`) with the top block (status label + course name) pinned to the top and the bottom block (time · room + 「今天还有 N 节」) pinned to the bottom, the slack absorbed by `Spacer(GlanceModifier.defaultWeight())` — Glance's `Column` has **no** `verticalArrangement`, so `Arrangement.SpaceBetween` is not an option. **Do not** wrap the single-column hero in such a card: it was implemented, reviewed on a real tablet, and rejected by the product owner — on a single-column card it replaces blank space with card padding and adds a frame that carries no meaning. Corollary, learned the hard way: **never give a text container a height estimated from its content** (font size × line height). Glance cannot measure text, the estimate was smaller than the real line box, and the hero's first line was clipped on the phone. Let content size itself; only a container that genuinely spans a whole column may distribute slack with a weighted `Spacer`.
- **Body content is a pure line sequence** (`bodyLines(state, style, plan)` → `List<BodyLine>` rendered by one `BodyLineView`): the real widget puts it in a `LazyColumn`, the config-page preview puts the same sequence in a plain `Column` because `LazyColumn` needs the launcher's `RemoteViewsService` and renders empty outside a host. Adding or reordering a line therefore cannot make the preview drift from the widget. The hero course name is **one line** (`maxLines = 1`): two wrapped lines eat the space that belongs to the remaining courses, which is exactly the trade-off users complained about.
- **`LazyColumn` is the only experimental opt-in besides the preview renderer**: one `@OptIn(ExperimentalGlanceApi::class)` for the scrolling list and one `@OptIn(ExperimentalGlanceRemoteViewsApi::class)` in `WidgetPreviewRenderer`. Both are official opt-in mechanisms, not suppressions; keep the count at two (see design D15). Rare launchers that cannot host collection widgets should fall back to height-truncated rows with a `+N` trailer.
- **Rendering must always read the latest resolved state (`WidgetRenderCache`)**: Glance invokes `provideGlance` only once per session; `update`/`updateAll` re-compose `provideContent` with the captured closure. If the composition reads the captured `state`, a time change or new snapshot pushes a refresh yet the pixels stay on the previous frame (device-reproduced defect, fixed 2026-09-19). Every refresh path converges on `WidgetRefreshController.resolveCurrentState`, which publishes the result into `WidgetRenderCache` (a process-local Compose `mutableStateOf`, written under `Snapshot.withMutableSnapshot`); `provideContent` reads `WidgetRenderCache.latest()` with the `provideGlance` result as fallback for the very first render.
- **The day-list phase model (R9)**: the resolver marks every today entry `FINISHED` / `IN_PROGRESS` / `UPCOMING` and exposes counts (`todayRemainingCount`, `todayFinishedCount`). The three finished policies (`show_dim` / `hide` / `collapse`) are a pure Java function (`WidgetDayListPolicy`) so they are JUnit-tested; the renderer only draws what the policy returns. The `compact` style renders no list, so the finished-policy is disabled in the config UI with an explanatory note (honesty requirement).
- **The day-selection rule (R11) is one pure function** (`WidgetDayPlan.resolve(todayItems, nextDayItems, finishedPolicy)` in Java, JUnit-tested): today has visible rows → list today; today has rows but the policy hides them all → show "今天已无课" and do **not** fall back to tomorrow (the user just asked for those rows to be hidden); today has no classes and tomorrow does → list tomorrow with the summary saying 「明天 周三 · 共 N 节」; neither day → no course rows at all, only the summary line plus the 「下一节 · 10月8日 周四 08:00 …」 hint. Long holidays therefore never turn into a fake class list. `WidgetDisplayState.nextDayItems` exists solely to feed this rule and is produced by `WidgetStateResolver` from `dayOffset + 1`.
- **Preview (R10, changed 2026-09-19 to WYSIWYG)**: the config-page thumbnails are **real Glance compositions** — `WidgetPreviewRenderer` composes the same `WidgetContent` through `GlanceRemoteViews.compose(context, size, null, Bundle.EMPTY)` and the Activity mounts the resulting `RemoteViews` in a `FrameLayout` (scaled down to the slot). The composition size is the instance's real cell size read from `OPTION_APPWIDGET_MIN_WIDTH/HEIGHT` (this is only truthful because `sizeMode` is `Exact`; with `Responsive` the widget composed at a different, smaller bucket size and the preview lied about the content). Two device-reproduced pitfalls are load-bearing: (a) inflate the `RemoteViews` with `applicationContext`, never the Activity — an `AppCompatActivity`'s inflater rewrites framework views into `AppCompat*` classes and `RemoteViews.apply()` then throws `ActionException: view: androidx.appcompat.widget.AppCompatImageView can't use method with RemoteViews`, killing the process; (b) the static mocks `widget_preview_next_up/compact` were deleted because keeping two renderers in sync is what let them drift. `WidgetPreviewRenderer.render` catches `RuntimeException` and the Activity wraps `showPreview` too, so a preview failure never blocks saving a style. Only the picker's `android:previewLayout` (`widget_preview_next_up.xml`, whitelisted classes only, kept in sync by hand, and depicting the **default** style so the picker answers 「放下去会得到什么」; it is truthful only while `W_REF/H_REF` stay at the 4×3 calibration size and the lower scale bound stays `1.0` — that file now says so in a comment, so lowering the bound or re-calibrating requires redrawing it) plus `android:previewImage="@drawable/widget_preview"` (from `scripts/generate-widget-preview.py`) remain static.
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
- **Day-selection and label logic (`WidgetDayPlanTest`, `WidgetDateLabelTest`)**: today wins over tomorrow; tomorrow only when today is empty; no rows at all when neither day has classes (long holidays); a day whose rows are all hidden by the finished policy must **not** fall back to tomorrow; `collapse` keeps its count even when no row is visible; `resolve(null, null, null)` degrades to an empty plan. `WidgetDateLabel` must split Web's pre-formatted `dayKey` into 「10月8日」 and reject out-of-range or malformed keys with an empty string — never guess a date.
- **Cross-layer (`WidgetSnapshotCrossLayerTest`)**: feed a fixture produced by the real Web builder into the native parser and resolver. Assert the right course is selected 42 days later with zero renders in between, the window end behaves, sensitive sentinel values never appear in the payload, and `dayOffset`/`dayEndEpochMs` semantics agree. Fixture: `android/app/src/test/resources/widget-snapshot-v1.json`. Assertions must derive their timestamps **from the snapshot** — never hardcode epochs, since a fixture generated in UTC+8 has different absolute values than one generated in UTC.
- **Device (本机可用：`/dev/kvm` 存在，`Medium_Phone` 模拟器 + adb 即可)**: 已实测通过的有放置（**拖放放下即自动弹配置页**，取消不留实例）、缩放到 provider 下限、最小尺寸下两套样式的像素布局、点击穿透打开 App、时间推进后的边界切换、精确闹钟授权/撤销、重启存活。仍未覆盖：多 launcher / OEM ROM、`fontScale ≥ 1.5`、真实相邻课跨边界。取证手法见下一节；逐项证据见 `.trellis/tasks/*/verification.md`。

**用 adb 驱动 launcher 的两个可复用手法**（合成手势与真实手势差异会导致误判，这里是实测可行的写法）：

```bash
# 1) 缩放实例：长按实例让四角出现缩放手柄，再拖某个手柄。
#    手柄坐标从截图换算（1080x2400 截图 displayed 900x2000 → ×1.2 得设备像素）。
adb shell input swipe 300 800 300 800 1200          # 长按实例空白处（别按到卡片上的按钮）
adb shell input swipe 516 644 760 644 900           # 拖右中手柄向右 = 加宽 1 格
#    注意：拖出「合法格子」才会产生新的 phase=widget_sized；拖到非法方向（低于 minWidth/minHeight）
#    不会有任何日志，看起来像"手柄抓不到"，其实是被 launcher 回弹。

# 2) 从选择器拖放放置：input swipe 会被 picker 当成滚动，必须自己控制时序。
adb shell input motionevent DOWN 400 900            # 落在选择器里的 widget 预览上
sleep 2                                              # 长按，等 launcher 进入拖放态
for y in 940 1060 1180 1300 1400; do adb shell input motionevent MOVE 540 $y; sleep 0.25; done
adb shell input motionevent UP 540 1400              # 落在桌面空白格 → 放置完成并弹出 WidgetConfigActivity

# 3) 判定"有没有留下实例"别靠截图：数 dumpsys 里的条目数
adb shell dumpsys appwidget | grep -c 'com.classtrack.app/com.classtrack.app.widget'   # provider + 每个实例各一条
```

**尺寸下限由 provider 声明决定**：`res/xml/class_track_widget_info.xml` 的 `minWidth/minHeight=110dp`，在 Pixel Launcher 上就是 2×2 格；文案里的「2x1 / Compact」指的是**紧凑样式**，不是格子尺寸，讨论尺寸问题时不要把两者混在一起。

**日志读法**：每次 `phase=widget_sized` 之后常紧跟另一条 `widget_sized`（高度 = 配置页预览画布高度、宽度不受约束，如 `w=850 h=169`），那是宿主侧预览/缩放代理的渲染，**不是**桌面实例尺寸；桌面实例尺寸要与截图量测互相印证（`w=179 h=210` ↔ 2×2 格）。

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
