# External research: Glance widget (checked 2026-09-19)

## Version/setup

- Google Maven metadata for `androidx.glance:glance-appwidget` reports stable `1.2.0`; latest published is `1.3.0-alpha02` (metadata last updated 2026-08-26). Recommend stable `1.2.0` for this feature unless alpha APIs are specifically required. Sources: [Google Maven metadata](https://dl.google.com/dl/android/maven2/androidx/glance/glance-appwidget/maven-metadata.xml), [Glance release notes](https://developer.android.com/jetpack/androidx/releases/glance).
- Coordinate: `implementation("androidx.glance:glance-appwidget:1.2.0")`; use `androidx.glance:glance-material`/`glance-material3` only if needed. The 1.2.0 POM declares Compose Runtime 1.7.8 and Kotlin stdlib 2.0.21 transitively; do not independently force a mismatched Compose BOM. If adding a BOM, verify its resolved graph against Glance's published metadata. Google Maven POM: [1.2.0 POM](https://dl.google.com/dl/android/maven2/androidx/glance/glance-appwidget/1.2.0/glance-appwidget-1.2.0.pom).
- Glance is Kotlin-first; this Java-only module needs the Kotlin Android plugin (matching a supported Kotlin 2.0.x line) and `.kt` source support. Minimal shape is root `plugins`/buildscript Kotlin plugin plus module `apply plugin: 'org.jetbrains.kotlin.android'`; no full Compose UI `buildFeatures.compose` is required for Glance-only code. Confirm Kotlin/AGP compatibility before pinning the plugin version.
- Glance AppWidgets support the app's minSdk 24; project compile/target 36 are adequate. Re-check release notes when implementing because the repository date is in the future relative to many cached docs.

## Widget anatomy

- Implement `class ClassTrackWidget : GlanceAppWidget()` and a `GlanceAppWidgetReceiver` whose `glanceAppWidget` returns it. Use `provideGlance(context, id)` for background data acquisition/setup and `provideContent { ... }` for composable UI. Source: [Build an app widget with Glance](https://developer.android.com/develop/ui/compose/glance/glance-app-widget).
- UI uses `GlanceModifier`, `Column`/`Row`, `Text`, `Box`, and `LazyColumn` (import Glance versions, not arbitrary Compose UI widgets). A prominent next-class `Card`/`Row`, followed by a bounded `LazyColumn` of remaining classes, is appropriate. Highlight one row by changing `GlanceModifier.background`/text color based on an `isNext` or stable ID flag; avoid relying on unsupported arbitrary Compose modifiers.
- Clicks: `actionRunCallback<SomeAction>()`, custom `ActionCallback`, `actionStartActivity`/`actionStartActivity<MainActivity>()` (API naming depends on Glance version), or `clickable(actionStartActivity(...))`. Use a stable explicit action to open the schedule screen; do not put sensitive payloads in an exported intent.
- Size: `SizeMode.Responsive(setOf(DpSize(...)))` allows distinct layouts per supported size; alternatively use `Single` for predictable output. Query size in `LocalSize` and cap the remaining-class list so small widgets do not overflow.
- Glance content is converted to RemoteViews and runs asynchronously/background; read a small immutable snapshot in `provideGlance`, do not touch WebView/localStorage or UI-only APIs.

## Provider XML and update behavior

- Typical `res/xml/class_track_widget_info.xml`: `<appwidget-provider xmlns:android="..." android:minWidth="..." android:minHeight="..." android:resizeMode="horizontal|vertical" android:updatePeriodMillis="0" android:initialLayout="..." android:description="@string/..." android:previewLayout="@layout/..." android:targetCellWidth="..." android:targetCellHeight="..." />`. Android 12+ supports/recommends `description`, `previewLayout`, and target cell dimensions; retain `minWidth`/`minHeight` for compatibility. `resizeMode` should permit both axes if the responsive layout is tested.
- `updatePeriodMillis` is system-controlled and cannot be relied on below the platform's roughly 30-minute cadence; set it to 0 or a coarse fallback. It is unsuitable for exact class starts/ends.
- `GlanceAppWidget.update(context, glanceId)` updates one instance; `updateAll(context)` updates all instances. To update from a Capacitor plugin, either call a Kotlin `@JvmStatic` bridge that launches the suspend update on an appropriate coroutine scope, or send an explicit broadcast to the receiver and have it call update. Directly calling a suspend API from Java requires a coroutine bridge; the broadcast approach is less interop-sensitive. See [Glance reference](https://developer.android.com/reference/kotlin/androidx/glance/appwidget/GlanceAppWidget) and [AppWidgetManager](https://developer.android.com/reference/android/appwidget/AppWidgetManager).

## Boundary scheduling trade-offs

- WorkManager periodic work has a 15-minute minimum and is inexact; it is useful as a liveness/staleness fallback, not ±1 minute boundary timing. Source: [WorkManager periodic work](https://developer.android.com/develop/background-work/background-tasks/continuous/periodic).
- `AlarmManager.setExactAndAllowWhileIdle` can target a class boundary but Android 12+ exact-alarm access is constrained by `SCHEDULE_EXACT_ALARM` special access (or `USE_EXACT_ALARM` for narrowly eligible alarm-clock/calendar use cases), and idle/device OEM policies still affect delivery. `AlarmManager.set` is inexact. Sources: [AlarmManager](https://developer.android.com/reference/android/app/AlarmManager), [Exact alarms permission](https://developer.android.com/develop/core-architecture/app-special-access/exact-alarm).
- Least-permission recommendation: schedule the next boundary with inexact `AlarmManager.set` (or one-off WorkManager) plus an immediate refresh on plugin push and foreground. Accept a small delivery window and re-evaluate `now` on receipt. Do not request exact-alarm special access for a course widget unless ±1 minute is a hard product requirement; if it is, document the permission/settings flow and reschedule after reboot/timezone/time changes. `ACTION_APPWIDGET_UPDATE` is a broadcast lifecycle event, not an exact timer.

## Known pitfalls/preview

- Glance is not general Compose: supported composables/modifiers and RemoteViews behavior are limited; custom fonts are not supported as arbitrary downloaded Compose fonts. Keep typography and layout simple and test on launcher variants.
- Use Preferences/DataStore state only for small widget state; this design's SharedPreferences JSON is acceptable as the source. Persist the snapshot atomically enough that a receiver never parses a partially written string.
- `GlanceAppWidget` has previews: use Glance preview annotations/providers and the `glance-appwidget-preview`/`glance-preview` artifacts where supported by 1.2.0, plus Android Studio preview tooling. Preview rendering is helpful for layout iteration but does not replace launcher/device validation (RemoteViews, resizing, dark mode, and OEM behavior need a device). Sources: [Glance previews](https://developer.android.com/develop/ui/compose/glance/glance-app-widget#preview), [Glance preview API](https://developer.android.com/reference/kotlin/androidx/glance/appwidget/preview/package-summary).
- Use `GlanceTheme`/dynamic color carefully and supply explicit light/dark-safe colors; launcher theme behavior varies. A “highlight next row” conditional background/border is safer than relying on animation or custom drawables.

## Caveats

- The Maven metadata is date-stamped after the requested research date only in the sense of the supplied project date; pin stable 1.2.0 based on the fetched metadata and verify again at implementation time. Documentation pages intermittently timed out during retrieval, so URLs above are canonical references and API names should be checked against the exact resolved 1.2.0 artifacts.
- `previewLayout` can require an actual legacy RemoteViews layout resource even when runtime rendering is Glance; provide a small valid preview or omit only if the Android 12 preview requirement is intentionally waived.
