# 重构金智教务课表导入

## Goal

把天津理工大学课表导入从“安装书签脚本、打开教务系统、下载 JSON、回到 ClassTrack 上传”的多次手工操作，改造成更接近 WakeUp 的应用内导入体验：用户在应用内打开金智教务系统，完成登录并进入课表详情后，由应用捕获课表接口响应并直接导入现有课程模型。

用户价值：不要求用户安装外部浏览器插件、油猴脚本或手动搬运 JSON 文件，同时保留登录过程在教务系统自己的页面中，ClassTrack 不接触账号密码。

## Background and confirmed facts

- 当前导入流程位于 `app/components/import-flow/`，天津理工大学需要经历“安装脚本 → 打开课表页 → 执行脚本 → 下载 JSON → 上传 JSON”。
- 当前天津理工大学书签脚本已验证金智接口：
  - 页面入口：`https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do`
  - 课表接口：`/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do`
  - 请求方式：POST，表单参数 `XNXQDM`
  - 主要响应：`datas.cxxszhxqkb.rows`
- 现有解析器 `app/lib/parsers/tianjin-university-of-technology/parser.ts` 已能将该响应转换成 `Class[]`，本任务的主要缺口是登录态下的响应获取。
- 项目已包含 Capacitor Android 工程，但 `MainActivity` 目前只是空的 `BridgeActivity` 子类，依赖中没有 `@capacitor/browser` 等外部浏览器插件。
- 普通 Web/PWA 页面与教务系统不同源，不能可靠地通过 iframe、Service Worker 或 ClassTrack 自己的 `fetch` 读取跨源页面、Cookie 或 DOM；Web 端需要保留可用的降级导入方式。
- 开源项目调研结果已记录在 `research/open-source-in-app-import.md`：
  - `baoozak/timetable` 使用内嵌 WebView、页面注入和原生回传；
  - `JFyuhong/JLU_schedule` 使用独立 Android WebView、注入 XHR/fetch hook、JavaScript bridge、响应筛选和缓存解析；
  - 多个金智脚本项目证明接口响应拦截比单纯 DOM 解析更完整。
- 本次修改必须在独立 Git 分支上进行；已创建并切换到 `feat/in-app-jinzhi-import`。

## Requirements

### R1. 应用内教务页面

在支持原生能力的运行环境中，用户可以从 ClassTrack 导入流程打开天津理工大学金智教务入口，在同一个内嵌 WebView 中完成登录、验证码、菜单导航和课表页面操作，不跳转到系统外部浏览器。

### R2. 登录态课表捕获

导入器只捕获目标金智课表接口或明确符合课表响应特征的数据，不读取或记录账号密码、Cookie 和无关请求。用户点击导入后，应用使用当前 WebView 登录态下最近一次有效课表响应。

### R3. 复用现有解析与写入

捕获到的原始响应交给现有天津理工大学解析器和 Zustand 导入逻辑，保持课程字段、学期识别、第一周日期、历史课程出勤标记和本地持久化行为一致，不复制另一套课程解析模型。

### R4. 可恢复的用户流程

导入页面应提供明确的当前状态、成功反馈和失败提示；支持刷新/重新进入课表页面后重试、返回键返回网页历史或退出导入；重复点击不能触发并发导入。

### R5. Web/PWA 降级

普通浏览器/PWA 在不具备项目原生 WebView bridge 时，仍能使用现有可行的 JSON/书签脚本导入方式；不能伪装成支持应用内捕获，也不能因原生方案改造而破坏备份导入和现有 JSON 解析。

### R6. 无外部插件边界

首版不引入浏览器扩展、油猴脚本、第三方 Capacitor 浏览器插件或远程代理服务。若需要 Android bridge、WebView 和导入 Activity，相关代码属于本项目 Android 工程，并通过已有 Capacitor 应用边界接入。

### R7. 安全与维护

限制响应 URL、响应大小和保存范围；不把敏感页面内容写入普通日志；页面跳转后保证 hook 可幂等重注入；适配器接口应允许后续学校复用“WebView + 响应捕获”模式。

## Acceptance Criteria

- [ ] 在 Android Capacitor App 中，用户可从导入入口进入天津理工大学教务网址，并在应用内完成登录和导航。
- [ ] 在金智课表详情页点击“导入当前课表”后，无需安装书签脚本、复制脚本或手动下载/上传 JSON，即可导入当前学期课程。
- [ ] 捕获失败时，页面会说明需要进入/刷新课表详情或重试，而不是静默失败；登录失败和网络错误有可理解的提示。
- [ ] 导入结果仍由现有天津理工大学解析器生成 `Class[]`，至少覆盖课程名、教师、教室、星期、起止节次、周次和学期代码。
- [ ] 捕获逻辑只处理目标课表响应，不在日志或持久化数据中暴露账号密码、Cookie 或无关请求。
- [ ] 普通 Web/PWA 仍可使用保留的降级导入流程；备份 JSON 导入不受影响。
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm lint` 和 `pnpm build` 通过；Android 工程可完成对应 Debug 构建或明确记录环境阻塞。
- [ ] 为响应筛选、接口捕获/消息桥接和导入失败路径补充可自动验证的测试；不能在没有真实教务账号的情况下把登录流程作为唯一测试依据。
- [ ] 代码修改发生在独立分支 `feat/in-app-jinzhi-import` 上。

## Out of scope

- 不实现账号密码代填、账号托管、云同步或服务端代理。
- 不承诺普通 Web/PWA 能绕过浏览器同源策略实现与 Android 原生 WebView 等价的自动捕获。
- 首版不同时实现 iOS 原生 WKWebView 适配；iOS 作为后续平台扩展点，除非技术设计阶段确认成本可控且不影响 Android MVP。
- 不同时为所有高校重写导入方式；首版以天津理工大学金智系统为验证适配，抽取可复用边界即可。
- 不以 DOM 解析替代已验证的金智接口响应捕获；DOM fallback 可作为后续独立需求。
- 不改变 `Class`、`Semester` 或备份 JSON 数据格式，不重做课程表展示和备份导入。

## Key decision

- 首版采用“Android Capacitor 应用内导入 + Web/PWA 保留现有降级流程”。这符合用户选择，也符合技术约束：普通 Web/PWA 受同源策略限制，无法在不增加浏览器脚本、外部插件或服务端代理的情况下实现同等自动抓取；当前仓库已有 Android WebView 容器，可以用项目自有原生代码完成 MVP。
- Android 首版不引入 `@capacitor/browser` 等第三方浏览器插件；原生 WebView、导入 Activity 和 Capacitor bridge 均属于本项目 Android 工程。

## Research

- `research/open-source-in-app-import.md`
