# Baseline and asset evidence

## Environment

- Branch: `fix/native-import-white-screen-ui`
- Baseline commit before this task's implementation: `d8d0ef0`
- AVD: `Medium_Phone`, Android Emulator `37.1.11.0`, Android `37.1` `google_apis_playstore_ps16k` `x86_64`
- SDK: `/home/yetongy/Android/Sdk`; ADB: `/usr/bin/adb`
- `adb devices -l`: no connected devices
- `/dev/kvm`: absent
- The original AVD was not modified. A copy under `/tmp/classtrack-avd` was used for the launch attempt.

## Fresh web sync

`pnpm cap:sync:android` completed successfully. The generated web index and Capacitor-synced index are identical:

- `build/client/index.html`: 3770 bytes, SHA-256 `e30f1a89d30038f383dcf5c50c14983ce2599bafb6e889d7f4dfe4d0a748193d`
- `android/app/src/main/assets/public/index.html`: 3770 bytes, SHA-256 `e30f1a89d30038f383dcf5c50c14983ce2599bafb6e889d7f4dfe4d0a748193d`
- 27 local index references resolve to synchronized assets
- The synchronized directory contains 245 files; the web build contains 243 files, with only Capacitor-generated `cordova.js` and `cordova_plugins.js` as expected extras.

## Stale APK evidence

The existing `android/app/build/outputs/apk/debug/app-debug.apk` predates the synchronized assets and was not used as fresh-device evidence:

- APK size: 7207289 bytes
- APK SHA-256: `65f3f253f277c8b126caccbbabcfd3fdf1534a7d16a6c1b694e2e107ff700635`
- APK `assets/public/index.html` SHA-256: `8a96ca131a27f4209fb4bc9188ed5d47df6764320ee2ecf1a57734668bd1ef64`
- The consistency guard reports 51 missing current entries, 51 stale extra entries, and 2 changed entries (`index.html` and `sw.js`).
- Therefore the observed shell 404/abnormal UI cannot be attributed to the current source until a fresh APK is built and installed. The guard now rejects this APK before installation.

## Build/device blockers

- Wrapper invocation with the default Gradle home fails before starting Gradle because the home is read-only:
  `FileNotFoundException: .../gradle-8.14.3-all.zip.lck (Read-only file system)`.
- A writable temporary Gradle home cannot download the wrapper because `services.gradle.org` is unreachable (`java.net.UnknownHostException`). An offline direct Gradle attempt also lacks cached artifacts, including `com.google.guava:listenablefuture:9999.0-empty-to-avoid-conflict-with-guava` and `commons-logging:commons-logging:1.2`.
- The writable AVD copy fails to start with:
  `x86_64 emulation currently requires hardware acceleration` and `/dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded`.

No APK was freshly built or installed in this environment. Consequently, no Android screenshots, WebView resource callbacks, academic-page 404 classification, or logcat reproduction is claimed. No credentials, cookies, authorization data, query values, form values, response bodies, or raw JSON were recorded.
