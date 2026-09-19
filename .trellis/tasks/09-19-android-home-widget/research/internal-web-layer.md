# Internal web-layer findings

## Persisted state

- `app/store/index.ts:16-31` creates the persisted Zustand store with localStorage key `class-track-storage`, schema version `CLASS_TRACK_SCHEMA_VERSION` (currently 3), `createJSONStorage(() => localStorage)`, and `migrateClassTrackState`.
- Its `partialize` output is exactly `{ school, classes, classMarks, currentWeek, isInitialized, firstWeekStartDate, semesters, currentSemesterId, courseMetadata, schemaVersion }`; UI-only slice state is excluded. The widget bridge should not attempt to parse this localStorage directly.
- `app/lib/types.ts:1-20` defines `Class`: id/name/teacher/classroom, `startTime`/`endTime`, `dayOfWeek` (1 Monday through 7 Sunday), `startSection`/`endSection`, `weeks`, and semester/course identity fields. `AppData` is at `app/lib/types.ts:92-104`; `Semester` is at `:48-61` and duplicates the active class data plus metadata and timestamps.
- `app/store/migrations.ts:5` fixes schema version 3. `createEmptyAppData` is `:21-34`; `migrateClassTrackState` is `:47-121`. Migration normalizes legacy state and selects the active semester, so the bridge should consume the live store snapshot rather than duplicate migration rules.

## Week/date and schedule behavior

- `app/features/schedule/utils.ts:35-45`, `getDayDate(firstWeekStartDate, currentWeek, dayOfWeek)`, maps a first-week Monday to a date using `(currentWeek - 1) * 7 + (dayOfWeek - 1)` and `date-fns/addDays`. It uses `new Date(firstWeekStartDate)`, which is a timezone caveat for date-only strings; the native bridge should resolve dates in the device's local zone (or receive absolute local date-times from JS).
- `getMaxWeek` (`utils.ts:57-63`) takes the maximum of each class's `weeks`, with a 20-week fallback. `getCurrentRealWeek` (`:75-77`) delegates to `getCurrentWeek` and that max. `getCurrentWeek` (`:90-105`) computes `floor((today - new Date(firstWeekStartDate)) / 24h / 7) + 1`, clamped to `[1, maxWeek]`; no date means week 1. This is an app display-week calculation, not a robust timezone-aware instant calculation.
- `app/features/schedule/SchedulePage.tsx:38` selects the displayed week's classes with `classes.filter(classItem => classItem.weeks.includes(currentWeek))`. It does not select today's or next classes and does not filter odd/even weeks separately: imported `weeks` is already the authoritative expanded week list. There is no schedule `constants.ts` section-to-clock table; `app/features/schedule/constants.ts:1-5` only defines labels, weekdays, and sections 1–12. Each `Class` already carries `startTime` and `endTime`; `startSection`/`endSection` are presentation labels (`ScheduleTable.tsx:22-24`, dialog `:44-46`).
- `app/store/utils.ts:21-48`, `createPastClassMarks`, iterates every class's `weeks`. With a valid first-week date, `isPastClassSessionByDate` (`:79-87`) calls `getClassSessionEnd` (`:123-134`), which adds week/day offsets and sets `endTime`. Without one, `isPastClassSessionByCurrentWeek` (`:98-116`) compares week, weekday, then end time. These helpers are useful semantics for “remaining”, but they are not exported and have no start-time helper. A new bridge should explicitly instantiate absolute start/end local date-times and filter `end > now` (or preserve in-progress classes according to product decision).
- No odd/even-week algorithm or section clock mapping exists in the schedule feature. Search found only `weeks.includes(currentWeek)` and class-provided times. Do not invent a separate `单双周` interpretation in native code; the parser's expanded `weeks` array is the source of truth.

## Native plugin and change observation

- `app/lib/native-course-import.ts:1-59` is the plugin pattern: import `Capacitor, registerPlugin, WebPlugin`; define typed options/result/error-code unions; implement a `WebPlugin` fallback that throws a typed `CourseImportError`; call `registerPlugin<Interface>('CourseImport', { web: ... })`; use `Capacitor.getPlatform()` and `Capacitor.isPluginAvailable()` for capability checks; normalize known error codes with `getCourseImportErrorCode`.
- `app/lib/native-platform.ts:1-5` only exposes `isNativeApp()` via `Capacitor.isNativePlatform()`. A snapshot plugin can follow this small capability layer, but must remain safe on web with a no-op/rejected fallback.
- The store has no existing `useClassStore.subscribe(...)` observer. Search found no `visibilitychange`, Capacitor App `appStateChange`, `resume`, or native lifecycle listener in `app`; there is no current foreground refresh hook. `SchedulePage.tsx:20-27` has a local `useEffect` only for opening the import dialog, not synchronization.
- Zustand persist writes after state updates, but a bridge should subscribe to selected data and push a computed snapshot after persistence/state changes. Prefer one centralized lifecycle hook mounted at the app shell, with a debounced/coalesced push, rather than adding calls to every mutator in `dataSlice.ts`.

## Implementation implications

1. JS should read the active state (`classes`, `currentWeek`, `firstWeekStartDate`, `currentSemesterId`/semester) and compute concrete occurrences for today/next N, including absolute local date/time strings and a `generatedAt` instant.
2. Pushes must be triggered by class/semester/week/date mutations, app foreground, and ideally a startup push after hydration; native then only performs cheap time-position recomputation and rendering.
3. If `firstWeekStartDate` is absent, the bridge must define an explicit fallback (likely currentWeek + today mapping) and expose a stale/unknown-date status rather than silently deriving incorrect calendar dates.
