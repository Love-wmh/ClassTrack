# Internal Android-layer findings

## Module/tooling baseline

- `android/variables.gradle:2-13`: minSdk 24, compileSdk 36, targetSdk 36; AGP 8.13.0 is in root `android/build.gradle:4-15`; Gradle wrapper is 8.14.3. `android/app/build.gradle:1` applies only `com.android.application`; there is no Kotlin plugin, Compose configuration, `buildFeatures.compose`, Kotlin compiler options, or desugaring.
- `android/settings.gradle:1-5` includes only `:app` and `:capacitor-cordova-android-plugins`; root repositories are Google/Maven Central (`android/build.gradle:19-25`). Kotlin/Glance dependencies must therefore be added deliberately, preferably with a Kotlin plugin version compatible with AGP/Gradle and a minimal `build.gradle` setup. Glance itself brings Kotlin runtime transitively, but Kotlin source and Compose-style Glance APIs require compiling Kotlin.
- Existing app dependencies (`android/app/build.gradle:35-47`) are AppCompat, WebKit, CoordinatorLayout, core-splashscreen, Capacitor, JUnit/JSON tests, and test UI libraries. There is no `@capacitor/preferences` npm package in `package.json` (dependencies list has filesystem/share, not preferences), and no Android Preferences plugin dependency.

## Manifest/activity/plugin pattern

- `android/app/src/main/AndroidManifest.xml:4-43` has one application, exported `MainActivity` launcher, non-exported `CourseImportActivity`, and a private FileProvider. Only INTERNET permission is declared. A widget requires an exported receiver with `android.appwidget.action.APPWIDGET_UPDATE` and `android:resource="@xml/<provider-info>"`; keep the receiver non-direct-boot unless explicitly needed.
- `MainActivity.java:5-14` extends `BridgeActivity`; `onCreate` registers `CourseImportPlugin.class` before `super.onCreate`. The new plugin can be registered here if it only needs calls while the bridge activity exists, but a receiver/widget must be independently declared and callable when the app process is cold.
- `CourseImportPlugin.java:20-75`: `@CapacitorPlugin(name = "CourseImport")`, extends `Plugin`, exposes `@PluginMethod public void open(PluginCall call)`, reads strings with `call.getString`, validates each boundary input, rejects with Chinese message plus stable error code, launches an activity with `startActivityForResult`, and has an `@ActivityCallback` result method.
- `CourseImportPlugin.java:76-145` resolves/rejects a `PluginCall` with `JSObject`; defensive null/result checks and cleanup are explicit. `:147-188` canonicalizes and confines cache handoff files to `getActivity().getCacheDir()`, bounds payload size, reads UTF-8, and deletes private temporary files. For a snapshot plugin, validate JSON size/version and call `call.resolve()` only after the SharedPreferences commit/write and refresh request succeed; reject explicit codes on malformed payload/storage failure.
- `CourseImportActivity.java` is a large Java `AppCompatActivity` WebView shell; its important reusable principle is strict lifecycle/error handling, not its import-specific URL policy. It uses Java/Android APIs and no Kotlin interop today.

## Tests and build pipeline

- Unit tests under `android/app/src/test/java/com/classtrack/app/` are Java JUnit 4 pure-logic tests (`CourseImportNavigationPolicyTest`, `ScheduleResponseValidatorTest`, `CourseImportDiagnosticsTest`, `CourseImportShellUrlTest`, `PublicAssetPathResolverTest`, `ScheduleCaptureScriptTest`). They use `org.junit.Test` and static `org.junit.Assert` methods; no device/Android UI is needed. A pure Java snapshot validator/date-position helper can follow this convention, while Glance rendering needs separate Glance testing or an instrumented/device check.
- `package.json:6-17`: `cap:sync:android` runs `pnpm build && cap sync android`; `cap:build:android` syncs, runs `./android/gradlew -p android assembleDebug`, then `android:check-assets`; `android:check-assets` runs `scripts/check-android-assets.js`.
- `scripts/check-android-assets.js:7-14,115-162` verifies build/client versus synced Capacitor assets and APK `assets/public`, checks native shell route contract, local references, and hashes. It does not inspect widget resources, so widget XML/Kotlin files must not alter the web asset output or `CourseImportShellUrl` contract.
- `scripts/install-android.sh:1-75` requires JDK 21 with `jlink`, Android SDK, adb, builds through `pnpm cap:build:android`, repeats the asset check, installs debug APK, force-stops and launches the app. New Gradle dependencies must work with JDK 21 and the existing AGP/wrapper.

## Recommended Android shape

- Keep the Capacitor bridge entrypoint Java (`SnapshotPlugin.java`) and use plain `Context.getSharedPreferences(...).edit().putString(...).commit()` or a carefully checked `apply()` followed by refresh. A Java plugin can invoke a Kotlin `object` method through a stable `@JvmStatic` API, but a broadcast to a declared receiver avoids coupling the plugin to Glance Kotlin internals.
- Put widget rendering in Kotlin because Glance is Kotlin/Compose API. Add the smallest Kotlin Android plugin/compiler setup, Glance appwidget dependency, and (if using `java.time` below min API) core-library desugaring. Keep pure payload parsing/validation and time-window logic in Java/Kotlin unit-testable classes independent of Glance.
- Do not rely on `updatePeriodMillis` for boundary accuracy; plugin immediate refresh plus a native scheduler is required. Manifest permissions should be added only if the chosen exact-alarm strategy is accepted.
