#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="${CLASS_TRACK_ANDROID_APP_ID:-com.classtrack.app}"
APK_PATH="${CLASS_TRACK_ANDROID_APK_PATH:-$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk}"

# macOS：Homebrew 的 JDK 21 与 ~/Library/Android/sdk；Linux：apt 的 JDK 与 ~/Android/Sdk
if [[ "$(uname -s)" == "Darwin" ]]; then
  DEFAULT_JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  DEFAULT_ANDROID_SDK="$HOME/Library/Android/sdk"
else
  DEFAULT_JAVA_HOME=""
  DEFAULT_ANDROID_SDK="$HOME/Android/Sdk"
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/jlink" ]]; then
  # 先从 PATH 里的 javac 反推（Linux 上最常见的安装形态）
  if command -v javac >/dev/null 2>&1; then
    derived="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
    if [[ -x "$derived/bin/jlink" ]]; then
      export JAVA_HOME="$derived"
    fi
  fi
  if [[ -z "${JAVA_HOME:-}" && -n "$DEFAULT_JAVA_HOME" && -x "${DEFAULT_JAVA_HOME}/bin/jlink" ]]; then
    export JAVA_HOME="$DEFAULT_JAVA_HOME"
  fi
fi

if [[ -z "${ANDROID_HOME:-}" && -d "$DEFAULT_ANDROID_SDK" ]]; then
  export ANDROID_HOME="$DEFAULT_ANDROID_SDK"
fi

if [[ -z "${ANDROID_SDK_ROOT:-}" && -n "${ANDROID_HOME:-}" ]]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

ADB="${ADB:-}"
if [[ -z "$ADB" && -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
  ADB="${ANDROID_HOME}/platform-tools/adb"
fi
if [[ -z "$ADB" ]]; then
  ADB="$(command -v adb || true)"
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  echo "未找到可用的 JDK。请设置 JAVA_HOME 为包含 jlink 的完整 JDK 21。" >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME" ]]; then
  echo "未找到 Android SDK。请设置 ANDROID_HOME，例如 $DEFAULT_ANDROID_SDK。" >&2
  exit 1
fi

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "未找到 adb。请安装 Android platform-tools，或把 ADB 指向可执行文件。" >&2
  exit 1
fi

DEVICE_COUNT="$("$ADB" devices | awk 'NR > 1 && $2 == "device" { count++ } END { print count + 0 }')"
if [[ "$DEVICE_COUNT" -eq 0 ]]; then
  echo "没有检测到已授权的 Android 设备。请用 USB 连接手机并打开调试授权。" >&2
  "$ADB" devices >&2
  exit 1
fi

echo "使用 JAVA_HOME=$JAVA_HOME"
echo "使用 ANDROID_HOME=$ANDROID_HOME"
echo "构建 Debug APK..."
pnpm cap:build:android

if [[ ! -f "$APK_PATH" ]]; then
  echo "未找到 APK：$APK_PATH" >&2
  exit 1
fi

# cap:build:android checks the default output; repeat the check for a custom APK path.
CLASS_TRACK_ANDROID_APK_PATH="$APK_PATH" pnpm android:check-assets

echo "安装到 Android 设备：$APK_PATH"
"$ADB" install -r "$APK_PATH"
"$ADB" shell am force-stop "$APP_ID"
"$ADB" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
echo "已安装并启动 $APP_ID"
