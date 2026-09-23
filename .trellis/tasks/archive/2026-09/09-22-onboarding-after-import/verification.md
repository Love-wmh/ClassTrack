# verification.md — 验收证据（2026-09-22）

任务：`09-22-onboarding-after-import`（导入后使用引导 + 安卓导入方式收窄）
口径：`prd.md` 的 A1-A9；实现见 `implement.md` §1-§6。

## 0. 一句话结论

**代码与门禁全部通过（141 个单测绿，五项门禁绿）；「安卓运行期」的那几条（A4/A5/A7 的设备半边与 R2 的面板渲染）在本机无法验证**：
模拟器缺 `/dev/kvm` 且 AVD 目录只读，浏览器 CDP 又够不到沙箱内的 dev server（见 §4 的原始输出）。
这两条**未被验证**，不得当作已验证；§4 末尾给出可复现的手工复验步骤。

## 1. 门禁证据（A8 ✅）

原始输出：`evidence/gates.log`

| 命令 | 结果 |
|---|---|
| `pnpm typecheck`（react-router typegen && tsc） | 通过，无输出 |
| `pnpm lint`（`--max-warnings 0`） | 通过（仅剩仓库既有的 React version 提示，非告警） |
| `pnpm format:check` | `All matched files use Prettier code style!` |
| `pnpm test` | `Test Files 18 passed (18)` / `Tests 141 passed (141)` |
| `pnpm build` | `✓ built in 6.73s`（client）+ `✓ built in 7.30s`（server） |

改动前的基线是 101 个用例；本轮新增 40 个（含策略矩阵、引导标记、渲染断言、接线守卫）。

## 2. 验收点逐条

| ID | 验收点 | 证据 | 结论 |
|---|---|---|---|
| A1 | 策略纯函数：三平台 × 插件 × 适配器全矩阵 | `app/lib/import-methods.test.ts`：8 行矩阵 `it.each` + 不变量断言（列表非空、默认值在列表内、顺序是规范序子序列） | ✅ 已验证 |
| A2 | 每个提示码都有非空文案（漏一个即红） | `import-methods.test.ts` 里「提示码表不许有多余键 + 文案非空 + 含『导入已有数据』」 | ✅ 已验证 |
| A3 | 引导「已读」判定：未读 / 已读 / 无存储 / 存储抛异常 | `app/lib/widget-guide.test.ts`：5 个标记用例（含 `null` 与 throwing storage）+ 触发判定四象限 | ✅ 已验证 |
| A4 | 导入成功后引导出现；Android 原生之外不出现 | 判定纯函数已测（A3）；**三条导入路径都调用触发**由 `widget-guide.test.ts` 的「源文件级守卫」钉住（调用计数 = 3 + `root.tsx` 挂载断言）；容器在非安卓返回 `null` 由 `isNativeWidgetSnapshotAvailable()` 保证（与 `WidgetPinEntry` 同一判定，已有设备验证史） | ⚠️ **部分验证**：逻辑与接线已钉住；**运行期未在设备上验证** |
| A5 | 「去添加」→ 课表页 + 面板自动展开；「知道了」→ 只关闭 | CTA 实现走 store（`showWidgetGuide=false` + `widgetPinSheetOpen=true` + `navigate('/')`），`WidgetPinEntry` 的 Sheet 已改成受控 | ⚠️ **未运行期验证**（需设备） |
| A6 | 面板与引导共享同一份尺寸提示常量 | `widgetPinPresets.test.ts`：「常量非空且含『尺寸』」+「`widgetGuideSteps()` 含该常量原文」+「`WidgetPinEntry.tsx` 源码引用该常量名」（读真实文件） | ✅ 已验证 |
| A7 | 安卓：天理 = 应用内 + 备份；天工 = 备份 + 提示且无解析器卡；非安卓三张卡照旧 | `app/components/import-flow/ImportMethodList.test.ts`：4 个静态渲染断言（含 `data-method-count` 计数与提示原文）；策略矩阵覆盖平台维度 | ⚠️ **部分验证**：渲染与策略已钉住；**设备上的真实列表未验证** |
| A8 | 五项门禁全绿 | §1 | ✅ 已验证 |
| A9 | 规格同步 `native-course-import.md`（+ `android-home-widget.md`） | 见 §3 | ✅ 已完成 |

## 3. 规格同步（A9）

- `.trellis/spec/frontend/native-course-import.md`：新增「安卓端导入方式收窄」契约（方式清单、默认方式、天工提示原文、非安卓不变、**天工安卓新用户无首次导入路径**这条已知限制）。
- `.trellis/spec/frontend/android-home-widget.md`：新增「尺寸提示单一来源」与「导入后引导入口」两条。

## 4. 运行期验证的阻塞（原文证据）

原始输出：`evidence/device-availability.log`、`evidence/browser-runtime-blocker.log`

```
$ emulator -accel-check
8
/dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded

$ ls -l /dev/kvm
ls: cannot access '/dev/kvm': No such file or directory

$ touch ~/.android/avd/Medium_Phone.avd/probe
touch: cannot touch '.../Medium_Phone.avd/probe': Read-only file system

$ adb devices
List of devices attached            # 无任何设备

$ (nohup pnpm dev --port 5199 &) ; curl -s -o /dev/null -w 'dev:%{http_code}\n' http://127.0.0.1:5199/
dev:200

$ agent-browser open http://127.0.0.1:5199/
✗ Navigation failed: net::ERR_CONNECTION_REFUSED
```

结论：
1. **模拟器不可用**：本沙箱没有 `/dev/kvm`（x86_64 镜像必须硬件加速），且 `~/.android/avd` 只读（连启动失败的陈旧锁文件都删不掉，`emulator` 直接以
   `A snapshot operation for 'Medium_Phone' is pending and timeout has expired` 退出）。
2. **浏览器 CDP 也不可用**：`agent-browser` 拉起的 Chrome 跑在本沙箱之外（继承外层 HTTP 代理），够不到沙箱内的 `127.0.0.1:5199`；
   把 dev server 绑到 0.0.0.0 也无济于事（沙箱有独立网络命名空间）。
3. 项目测试基建是 `environment: 'node'` 且**未安装** jsdom / happy-dom / @testing-library（`vitest.config.ts` 只收 `app/**/*.test.ts`），
   因此无法在 node 内补一个 DOM 运行期测试，而引入这些依赖超出本任务范围。

**因此以下内容仍属未验证**（**不要**在后续会话或文档里写成已验证）：

- 真机/模拟器上：导入成功后引导弹窗确实出现，且「只弹一次」在真实 localStorage 下成立。
- 真机/模拟器上：点「去添加」确实跳到课表页并展开面板。
- 真机/模拟器上：安卓端方式列表实际只剩两张卡（天理）/ 一张卡 + 提示（天工）。
- 面板里那条尺寸提示的**视觉观感**（是否与既有排版冲突）。

### 手工复验步骤（约 3 分钟，需要一台能装 APK 的机器）

```bash
pnpm cap:build:android                       # 产出 debug APK（含 assets 一致性校验）
bash scripts/install-android.sh              # 或 adb install -r android/app/build/outputs/apk/debug/app-debug.apk
# 应用内「首页 → 立即导入」打开导入框：
#   1) 学校选「天津理工大学」：应看到「导入已有数据」+「应用内打开教务系统」两张卡，且**没有**「从课程表解析」
#   2) 学校切「天津工业大学」：应只剩「导入已有数据」并出现两行提示（安卓暂不支持… / 请改用「导入已有数据」…）
#   3) 用「导入已有数据」导入任意一份备份 JSON：
#      应依次出现「已有数据导入成功」toast 与「把课表放到桌面」引导弹窗
#   4) 点「去添加」：应跳到课表页并自动展开「添加到桌面」面板，面板顶部有虚线框的尺寸提示
#   5) 杀掉应用重开、再导入一次：引导**不应**再自动出现（顶栏按钮仍在）
```

## 5. 回归口径确认（非 Android 未被收窄）

- 策略矩阵里的三行非安卓用例即是回归护栏：`['backup','parser']` / `['backup','parser','native-webview']`、默认 `parser`、无提示。
- `ImportMethodList.test.ts` 的第三条断言直接渲染「非安卓 + 有插件 + 有适配器」现场，断言三张卡都在。
- `widgetPinPresets.test.ts` 的既有断言（预设 id、厂商文案、无回调复核文案等）逐条保持绿 —— pin 链路与桥接未被改动。

## 6. 残余风险

| 风险 | 处置 |
|---|---|
| 运行期未验证（见 §4） | 已如实记录；建议合入后在真机做一次 §4 的手工复验 |
| 天工安卓新用户没有首次导入路径（产品口径） | 已写进 `native-course-import.md` 作为已知限制 |
| 引导与 toast 同时出现可能挤在一起 | 未在设备上核对视觉；引导是打断式 Dialog、toast 在顶部，理论上不遮挡按钮 |
| 面板从非受控改受控 | 只接管 `open`/`onOpenChange`；pin 状态机与模态逻辑未动，`widgetPinPresets.test.ts` 全绿 |
