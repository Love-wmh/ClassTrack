# 验证记录：移动端课表整周可见与信息密度优化

> 逐项对应 `prd.md` 的验收标准。所有数值都是本机真实执行的输出，未验证项在文末单独列出。

## 环境

| 项 | 值 |
| --- | --- |
| 提交 | `3bb1474`（P2+P3）+ 本次 P4 提交，分支 `feat/mobile-schedule-week-grid` |
| Web 门禁 | `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test` / `pnpm build` 全部 exit 0 |
| 浏览器断言 | `agent-browser`（Chrome via CDP），视口 412×915 DPR2、360×800 DPR2、1440×900 DPR1 |
| 数据 | `research/seed-schedule-fixture.js`（18 门课、第 3 周、含 21 字超长课名与单双周课） |
| 截图 | `research/after-mobile-412.png`、`research/after-mobile-360.png`、`research/after-desktop-1440.png`、`research/after-mobile-412-zoom2.png` |
| 真机环境 | Android 模拟器 `Medium_Phone`（API 37，Android System WebView），`adb` + CDP（`webview_devtools_remote` 转发到 `tcp:9222`），设备视口 411×914 @ dpr 2.625 |
| 真机产物 | `pnpm cap:sync:android` exit 0、`pnpm android:check-assets` 通过（247 assets、index sha256 一致）、`./android/gradlew -p android assembleDebug` BUILD SUCCESSFUL、`adb install -r -t` Success |
| 真机截图 | `research/android-emulator-1x.png`、`research/android-emulator-2x.png` |

## A. 整周可见（1x）

| 项 | 实测 | 判定 |
| --- | --- | --- |
| A1 412 无横向滚动 | `scrollWidth = 394 = clientWidth`，`noHScroll = true` | ✅ |
| A1 360 无横向滚动 | `scrollWidth = 342 = clientWidth`，`noHScroll = true` | ✅ |
| A1 7 列全在视口内 | `dayHeadCount = 7`，412 列左边界 `[41,93,144,196,248,300,351]` + 宽 52 → 最右 403 < 412 | ✅ |
| A3 360 列宽 ≥ 44px | `colWidths = [44,44,44,44,44,44,44]` | ✅（首轮实测 43px，把页面内边距收到 `px-2`、节次列收到 2rem 后达标） |
| A2 桌面端与改动前一致 | 1440：7 列、列宽 154、`min-width = 760px`、课名 `webkitLineClamp = 2`（18/18 全部截断=符合现状）、教室可见、节次列不显示时间、无缩放控件；截图与 `research/baseline-desktop-1440.png` 逐项对齐 | ✅ |

## B. 课程块信息

| 项 | 实测 | 判定 |
| --- | --- | --- |
| B1 长课名不截断 | 412：`clampedNameCount = 0`（18 个课名全部 `webkit-line-clamp: none`）；`毛泽东思想和中国特色社会主义理论体系概论` 完整渲染 | ✅ |
| B1 不溢出到相邻节次 | 412：`overflowNameCount = 0`；360：2 个课名超出块高（被 `overflow-hidden` 裁剪，未溢出到相邻行） | ✅（360 属已知限制） |
| B2 状态图标不占文本宽度 | 图标改为块右下角绝对定位（`absolute bottom-0.5 right-0.5`），课名独占整列宽度 | ✅ |
| B4 单双周徽标 | `[data-course-parity]` 可见 2 个，值均为 `单周`（对应周次 `[1,3,5,…]` 的大学英语Ⅲ 与 专业英语听说写Ⅱ）；桌面端可见数 0 | ✅ |

## C. 节次时间

| 项 | 实测 | 判定 |
| --- | --- | --- |
| C1 节次列显示时间 | 412 可见时间行 10 条：`1/08:00`、`2/09:40`、`3/10:10`、`4/11:50`、`5/14:00`、`6/15:40`、`7/16:10`、`8/17:50`、`9/18:30`、`10/20:05`；节次 11/12 只有节号、无占位空行 | ✅ |
| C1 桌面端不显示时间 | 1440：`visibleSectionTimeCount = 0` | ✅ |
| C2 课程块内无时间文案 | 课程块只渲染课名/单双周/教室/教师/备注 | ✅ |

## D. 缩放

| 项 | 实测 | 判定 |
| --- | --- | --- |
| D1 双指放大吸附到 2x | 派发两个 `pointerType: 'touch'` 的 PointerEvent，间距 100→200 → `zoom=2`、`tier=full`；反向捏合 → 回到 `zoom=1` | ✅ |
| D2 −/+ 逐档与边界禁用 | 1x（`−` disabled）→ 点 `+` → 1.5x（`tier=standard`，教室出现）→ 点 `+` → 2x（`+` disabled） | ✅ |
| D3 双击切换 | 2x 下双击 → 1x | ✅ |
| D4 2x 可横向拖动且字号不变 | `scrollWidth 788 > clientWidth 394`；列宽 52 → 108（≈2x）；课名 `fontSize` 保持 `11px` | ✅ |
| D5 分级显示 | 1x：教室 0、教师 0；1.5x：教室 2、教师 0；2x：教室 2、教师 3 | ✅ |
| D6 桌面端不渲染控件 | 1440：`controlRendered = false`（`isMobile &&` 条件渲染，不在 DOM） | ✅ |

## E. 门禁与回归

| 项 | 实测 | 判定 |
| --- | --- | --- |
| E1 五项门禁 | `typecheck` / `lint` / `format:check` / `test` / `build` 全部 exit 0；`vitest` **13 files / 67 tests passed** | ✅ |
| E2 纯逻辑用例 | `app/features/schedule/utils.test.ts` 13 条：节次时间推导（跨节/单节/众数/并列/空输入）、单双周、缩放裁剪与吸附、分级；全部不依赖 `new Date()` | ✅ |
| E3 手机端交互回归 | 点课程块 → 详情弹窗显示 `毛泽东思想和中国特色社会主义理论体系概论 / 第 3 周 · 第 1-2 节 / 王芳 / 28-A203`，Esc 关闭；`上一周` → 第 2 周；键盘 → 第 3、4 周；底栏 `navTop 850 ≥ tableBottom 838`，缩放浮层在课表范围内 | ✅ |
| E4 Android 资产同步 | `pnpm cap:sync:android` exit 0；`pnpm android:check-assets` 通过（247 assets、28 处 index 引用、index sha256 一致）；`assembleDebug` 出包并安装到模拟器 | ✅ |

## F. Android 真机（模拟器）验收

在 API 37 模拟器上安装 debug APK，通过 CDP 驱动真实触摸事件（`Input.dispatchTouchEvent`）与 `adb shell input tap` 验证；截图见 `research/android-emulator-1x.png` / `-2x.png`。

| 项 | 实测 | 判定 |
| --- | --- | --- |
| 1x 整周铺满（A1/A3） | `scrollWidth 394 = clientWidth 394`（无横向滚动）、7 个 `[data-day-head]` 各 52px、`8月` 表头与节次时间（可见 10 条）均渲染 | ✅ |
| 课名完整（B1） | 18 个课程块 `clampedNames = 0`，`毛泽东思想和中国特色社会主义理论体系概论` 在 1x 完整换行 | ✅ |
| 单双周徽标（B4） | `[data-course-parity]` 2 个，均为 `单周` | ✅ |
| 手势不被系统截走（N5/D1 前置） | `touch-action` 计算值 `pan-x pan-y`；捏合过程中 `visualViewport.scale` 始终为 1（未被系统接管做页面缩放） | ✅ |
| 双指捏合放大（D1） | 间距 100 → 240（CDP 真实触摸）→ `zoom=2`、`tier=full`、`scrollWidth 788 > 394`、列宽 52 → 108、课名字号仍 `11px` | ✅ |
| 双指捏合缩小（D1） | 间距 240 → 100 → `zoom=1`、`tier=compact` | ✅ |
| 档位按钮（D2） | 真机点 `+`：1x → 1.5x（`standard`，教室 2 个）→ 2x（`full`，教师 3 个，`+` disabled）；点 `−` 回到 1.5x | ✅ |
| 双击切换（D3） | 真机双击空位：1x → 2x → 1x（双向） | ✅（修复后，见下） |
| 单指横滑（D4） | `adb shell input swipe` → 2x 下 `scrollLeft 0 → 107` | ✅ |
| 点课程块与弹窗（E3） | 真机点课程块 → 弹窗 `毛泽东思想和中国特色社会主义理论体系概论 / 第 3 周 · 第 1-2 节 / 王芳`；点弹窗外关闭 | ✅ |
| 换周（E3） | 真机点 `上一周`：第 3 周 → 第 2 周 → 第 1 周 | ✅ |
| 底栏不遮挡（E3） | `tableBottom 814 ≤ navTop 826`；缩放浮层 90×34 完全落在课表内 | ✅ |

### 真机发现并修复的缺陷

**双击在真机上“没反应”**（桌面 Chromium 的断言全绿却漏掉）。用带时间戳的事件日志定位到：Android WebView 在一次双击后会派发 `pointerdown/pointerup/click` **两次**（间隔 31ms），并在第二次抬起后合成 `dblclick`。于是我们的 `pointerup` 双击判定与 `dblclick` 处理各切换一次档位，两次切换相互抵消（2x → 1x → 2x），表现为“点了没变化”。

修复：`useScheduleZoom` 的 `toggleZoom` 增加 400ms 去抖窗口，窗口内的第二次调用直接返回，两条触发路径保留其一。修复后真机双击 1x ↔ 2x 双向稳定通过；`pnpm typecheck / lint / test` 仍全绿，重新出包安装后复验通过。隐患已写入 `.trellis/spec/frontend/mobile-schedule-layout.md` 的 Common Mistakes 与 `design.md` D8。

### 复现方式（供后续回归）

```bash
./android/gradlew -p android assembleDebug
adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.classtrack.app/.MainActivity
# App 重启后 socket 名会变，必须重新转发
SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote[^ ]*' | head -1 | tr -d '\r')
adb forward tcp:9222 localabstract:$SOCK
# 然后经 CDP 灌种子数据、Page.reload，再用 Input.dispatchTouchEvent / adb input tap 驱动
```

**注意**：`adb shell input tap` 的坐标是**设备像素**，必须用 CSS 坐标 × devicePixelRatio（本机 2.625）；用 CSS 坐标直接点会落到课表格子里。

## 未验证项与原因

1. **物理真机（非模拟器）未验**：本次在 API 37 模拟器的 Android System WebView 上完成触控验收（见 F 段），已覆盖手势、`touch-action`、`preventDefault` 与合成 `dblclick` 等此前只能靠桌面 Chrome 推测的行为；但 OEM 定制 WebView（国产 ROM）与不同触摸采样率下的手感仍建议在真机上再过一遍。
2. **页面级双指缩放未处理**：在表头/导航空白区双指仍会缩放整个 App（本次范围不含 `root.tsx` 的 viewport 修改），若真机复现需另开任务加 `maximum-scale`。

## 已知限制（交付口径）

- 2 节块的节中空档时间（`08:45`/`08:55`）无法从解析数据推导，节次列只显示可推导的起止点。
- 360px 视口下 2 个超长课名（21 字）在 1x 会被块高裁剪，放大到 ≥1.5x 可完整显示。
- 缩放档位不持久化，退出页面回到 1x。
- 缩放浮层覆盖课表右下角一小块区域（最后节次右下角，通常为空）。
