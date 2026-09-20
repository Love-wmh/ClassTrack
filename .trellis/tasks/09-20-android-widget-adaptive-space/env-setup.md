# 本机构建与模拟器环境（实测记录）

> 本文件是 [implement.md](./implement.md) 的配套文件，只承载「在这台机器上怎么跑起来」与本次实测到的环境事实。
> **凭据、代理地址、本地路径属于环境信息，禁止写入仓库任何文件。**

## E1. 两种沙盒状态（先判断，再决定要不要绕）

| 状态 | 判据 | 做法 |
|---|---|---|
| 沙盒**关闭**（放开） | `ls /dev/kvm` 存在；`touch ~/.gradle/.w` 成功 | 直接用 `./android/gradlew -p android ...`，模拟器可直接启动 |
| 沙盒**开启**（受限） | `/dev/kvm` 不存在；`~/.gradle` 只读 | 必须按上一任务 `09-19-android-home-widget/env-setup.md` 的绕法：可写的 `GRADLE_USER_HOME` + `ANDROID_USER_HOME` + 代理配置 |

2026-09-20 实测：受限沙盒下 **x86_64 模拟器根本起不来**（`ERROR | x86_64 emulation currently requires hardware acceleration!`；`-accel off` 会退到 `FATAL | Failed to create jwk directory /run/user/1000/avd/running/...`）。因此**像素级验收必须在沙盒关闭的状态下做**。

沙盒关闭时的实测结论：

```
$ ls -la /dev/kvm          → 660 /dev/kvm
$ emulator -accel-check    → accel: 0 ; KVM (version 12) is installed and usable.
$ ~/.gradle                → 可写
$ /run/user/1000           → 可写
```

受限沙盒下的一个坑：`~/.cache/gradle-home/gradle.properties` 里存的代理密码会过期，表现为
`Received status code 407 from server: Proxy Authentication Required`。修法是从当前 `$HTTPS_PROXY` 里取凭据覆盖该文件的 `systemProp.*.proxyPassword`（该文件在仓库外）。

## E2. 两个 AVD

| AVD | 配置 | 用途 |
|---|---|---|
| `Medium_Phone` | 1080×2400 @420dpi，portrait（既有的那一个） | 对照组：2×2 与 4×3 不回归 |
| `Medium_Tablet` | 2560×1600 @280dpi，landscape（本次新建） | 大格子 / 平板验收 |

`Medium_Tablet` 的建法（本机没有 `avdmanager`，`cmdline-tools` 是空的，所以是手写配置；系统镜像沿用既有那一份）：

```bash
A=~/.android/avd
rm -rf "$A/Medium_Tablet.avd"
cp -a "$A/Medium_Phone.avd" "$A/Medium_Tablet.avd"
C="$A/Medium_Tablet.avd/config.ini"
sed -i 's/^AvdId=.*/AvdId=Medium_Tablet/; s/^avd.ini.displayname=.*/avd.ini.displayname=Medium Tablet/;
        s/^hw.lcd.width=.*/hw.lcd.width=2560/; s/^hw.lcd.height=.*/hw.lcd.height=1600/;
        s/^hw.lcd.density=.*/hw.lcd.density=280/; s/^hw.initialOrientation=.*/hw.initialOrientation=landscape/;
        s/^hw.ramSize=.*/hw.ramSize=4096/;
        s/^fastboot.forceFastBoot=.*/fastboot.forceFastBoot=no/; s/^fastboot.forceColdBoot=.*/fastboot.forceColdBoot=yes/' "$C"
printf 'avd.ini.encoding=UTF-8\npath=%s/Medium_Tablet.avd\npath.rel=avd/Medium_Tablet.avd\ntarget=android-37.1\n' "$A" > "$A/Medium_Tablet.ini"
rm -f "$A/Medium_Tablet.avd/multiinstance.lock" "$A/Medium_Tablet.avd/hardware-qemu.ini.lock"
```

启动与确认（冷启动约 60~75s，实测）：

```bash
nohup ~/Android/Sdk/emulator/emulator -avd Medium_Tablet -no-window -no-audio -no-boot-anim \
      -no-snapshot -gpu swiftshader_indirect > /tmp/emulator-tablet.log 2>&1 &
adb wait-for-device
adb shell getprop sys.boot_completed      # 1
adb shell wm size                         # Physical size: 2560x1600
adb shell wm density                      # Physical density: 280
adb shell dumpsys window displays | grep -m1 init=
#   init=2560x1600 280dpi ...  → dp ≈ 1462×914，触发 sw600dp
adb exec-out screencap -p > /tmp/tablet-home.png   # 实测 launcher 为平板布局（底部 taskbar）
```

坑：

- **同一个 AVD 只能起一个实例**：手机 AVD 还在跑时再起另一个（即使是副本）会报
  `FATAL | Running multiple emulators with the same AVD`。先 `kill` 掉正在跑的那个 qemu 进程再起下一个。
- **AVD 目录必须可写**：`~/.android` 在受限沙盒里只读，会让模拟器卡在
  `FATAL | A snapshot operation for 'X' is pending and timeout has expired`。沙盒关闭后不出现该问题。
- 平板 AVD 是**同一份 system image 上的平板显示配置**：`ro.build.characteristics` 仍为 `emulator`（不是 `tablet`），
  但屏幕 dp 尺寸 1462×914 触发 sw600dp，launcher 实测为平板布局。这一条要作为已知限制写进 verification.md。

## E3. 构建与安装

```bash
cd "/media/yetongy/64E8E38AE8E358B65/CodeFiles/SleepDown课程表/ClassTrack"
./android/gradlew -p android testDebugUnitTest        # 存量 71 用例基线
pnpm cap:build:android                                # = pnpm build + cap sync + assembleDebug + check-assets
adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
```

改了 Web 代码必须重跑 `cap:sync:android`；本次任务不动 Web 侧，但 `cap:build:android` 里仍会跑一遍 `pnpm build`。

## E4. 小工具取证的既有手法

沿用上一任务与 `classtrack-android-widget-device-verify` skill 里已验证的做法（缩放实例、从选择器拖放、数 `dumpsys appwidget` 条目、日志判据），要点：

- 放置：长按桌面空白 → Widgets → 搜应用名 → `input motionevent` 三段式拖放（`input swipe` 会被选择器当成滚动）。
- 缩放：长按实例让四角出现手柄，再拖手柄；低于 provider 下限的方向会被 launcher 回弹（无日志），要先做一次合法方向的对照拖动。
- 判据优先用日志：`phase=widget_sized`、`phase=widget_rendered`、`phase=style_configured`、`phase=preview_sized`，本次新增 `phase=layout_metrics`。
- 截图坐标是设备像素（平板 2560×1600 与手机 1080×2400 各自换算），`adb shell input` 用设备像素。

## E5. 阶段状态（每次推进后更新）

| 阶段 | 状态 | 实测结论 |
|---|---|---|
| 环境探针 | ✅ 完成 | 受限沙盒下 KVM 缺失、模拟器不可用；沙盒关闭后 `/dev/kvm` 可用、gradle 与模拟器均可跑 |
| `Medium_Tablet` | ✅ 完成 | 2560×1600 @280dpi 冷启动 75s 内 `boot_completed=1`，launcher 平板布局，无 FATAL |
| P0 基线 | ✅ 完成 | 手机 2×2 / 4×3 与平板 4×3 共 8 张基线截图落在 `research/baseline-*.png` |
| P1 量尺 | ✅ 完成 | 手机 2×2 = 179×210dp、3×2 = 276×210dp、4×3 = 373×321dp；平板 4×3 = 733×419dp → `wRef=373`、`hRef=321`、`maxScale=2.0`（平板实测 scale=131） |
| P2 度量与行判决 | ✅ 完成 | `WidgetLayoutMetrics` / `WidgetLinePolicy` / `WidgetBodyPlan` 落地；单测 71 → 111 全绿 |
| P3 配置页与诊断 | ✅ 完成 | 第三组选项按实例保存/回显/清键闭环；`phase=layout_metrics scale=… wide=… dual=…` |
| P4 双栏 | ✅ 完成 | 平板 4×3 实测 `dual=true`，左卡纵向填满、右栏 `LazyColumn` 正常出列表（`Row` 权重子列里承载集合型 widget 的平台风险已排除） |
| P5 回归与规格 | ✅ 完成 | 手机 2×2 与基线**逐像素相同**（差异包围盒 `None`）；spec 与静态预览注释已同步 |

### E6. 本次在设备上踩到的坑（都会影响取证结果）

1. **`am force-stop` 会让 launcher 把小工具按默认尺寸重摆**：为了「拿到干净的配置页」我一度在脚本里 force-stop，
   结果平板上的实例从 6×3 掉回 4×3、位置也换了一行，后续所有按固定坐标裁剪的截图全部错位。
   正确做法是按 BACK 关掉旧配置页（BACK 会 finish 该 Activity，`am start` 就能拿到全新实例）。
2. **配置页坐标不能硬编码**：页面高度随选中样式/实例尺寸变化，必须 `uiautomator dump` 后按文本定位（`/tmp/tap-text.sh`）。
   另外「页面被 am start 带到前台时仍停在底部」会表现为「找不到选项」，不是选项不存在。
3. **仅凭前台的 `am start` 无法刷新页面状态**：`-a android.appwidget.action.APPWIDGET_CONFIGURE` + `--ei appWidgetId <id>`
   才是配置页的正确入口（extra 名写错会得到 `config_rejected reason=invalid_widget_id`）。
4. **平板桌面第一行被系统时钟 widget 占用**：小工具最高只能到 3 行，6×4 在这台 AVD 上不可达（拖手柄做过两次尝试）。
   宽档证据改用 6×3 覆盖（`research/after-tablet-6x3-*.png`，几何见 E5/P5 说明）。
