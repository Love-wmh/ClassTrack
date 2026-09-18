# 技术设计：Android 内嵌 WebView 金智课表导入

## 1. 设计概述

首版采用 Android-only 的应用内导入能力：React/Capacitor 页面负责选择学校、学期和触发导入；项目自有 Android 代码负责打开独立的导入 Activity、承载教务 WebView、在教务页面上下文捕获金智课表响应；返回后继续由现有 TypeScript 解析器和 Zustand store 写入课程。

普通 Web/PWA 不具备该桥接能力，继续保留当前 JSON/书签脚本流程。不要尝试用 iframe、Service Worker 或跨域 `fetch` 模拟 Android 能力。

## 2. 模块边界

### 2.1 Web/React 层

新增一个小型平台适配层，例如 `app/lib/native-course-import.ts`：

- 定义 `CourseImportPlugin` 的 TypeScript 接口和 `open` 参数/返回值。
- 通过已有 `@capacitor/core` 的 `registerPlugin` 注册项目自有插件名 `CourseImport`。
- Web 实现明确抛出“当前环境不支持应用内导入”，不向 Web 端伪装能力。
- 暴露 `isNativeCourseImportAvailable()`，以 `Capacitor.getPlatform() === 'android'` 和 `Capacitor.isPluginAvailable('CourseImport')` 为准。

扩展 `ImportMethod`：

- `backup`：现有 ClassTrack 备份导入。
- `parser`：现有 JSON/书签脚本降级流程。
- `native-webview`：Android 且学校有原生适配时显示的应用内导入。

`app/components/import-flow/`：

- `ImportSchoolStep` 在 Android 且选中天津理工大学时展示“应用内导入”；浏览器端不展示该选项。
- 新增 `InAppImportStep`，展示学期代码、登录/进入课表详情的说明及当前状态；不再要求安装脚本。
- `useImportFlow` 增加 native 分支：调用插件、接收原始响应、调用 `getParserById(activeSchool.id).parse`，再走现有 `importClasses`、第一周日期和当前周次逻辑。
- native 导入取消/失败只关闭或提示当前流程，不污染现有备份/JSON 路径。
- 成功时直接关闭弹窗并复用已有成功 toast；不把原始 JSON 写入 localStorage 或下载文件。

### 2.2 Android Capacitor bridge

在 `android/app/src/main/java/com/classtrack/app/` 下增加项目自有插件和 Activity：

- `CourseImportPlugin.java`
  - `@CapacitorPlugin(name = "CourseImport")`。
  - `@PluginMethod open(PluginCall call)` 校验 `adapterId`、起始 URL 的 `https`/host 白名单和学期代码后启动 `CourseImportActivity`。
  - 使用 Capacitor 8 的 `startActivityForResult(call, intent, "handleImportResult")` 保存 JS 调用上下文。
  - `@ActivityCallback handleImportResult(PluginCall call, ActivityResult result)` 读取 Activity 私有缓存文件，将 `{ data, sourceUrl }` 解析结果 resolve 给 JavaScript；取消、文件不存在、超过大小限制等情况 reject。
  - 文件读取完成后立即删除临时文件；Activity 退出时清理当前会话文件。

- `CourseImportActivity.java`
  - `AppCompatActivity`，在 manifest 中声明 `exported=false`。
  - 通过代码或专用 XML 创建顶部返回/刷新区域、中间 WebView、底部“导入当前课表”按钮和捕获状态文案。
  - 固定使用 `https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do` 作为天津理工大学首版入口；后续学校通过 adapter spec 扩展，不让任意 URL 成为默认能力。
  - WebView 开启 JavaScript、DOM storage、Cookie；不开放文件访问，不启用不必要的混合内容。
  - `WebViewClient.onPageFinished` 后幂等注入捕获脚本；导航后再次注入。返回键优先 `webView.goBack()`，无历史时取消 Activity。
  - 使用进度条、可理解的错误状态和重复点击锁。
  - 只在有效目标响应到达且用户点击导入时返回结果；不自动提交或代填账号密码。

### 2.3 采集脚本与响应验证

采集逻辑放在 Android 代码的独立常量/工具类中，便于测试和后续适配：

1. hook `XMLHttpRequest.prototype.open/send`，保存 URL 并在 `load` 时读取 `responseText`。
2. hook `window.fetch`，使用 `response.clone().text()` 读取副本，不消费原始响应。
3. 只向 `CourseImportBridge.onScheduleResponse(url, body)` 发送 URL 包含 `/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do` 的响应；限制 body 长度。
4. 原生 bridge 再次校验当前页面 host、URL path、JSON 结构和 rows 数量，至少要求存在 `datas`、`cxxszhxqkb`、`rows`、`KCM`，拒绝 HTML、登录页和无关请求。
5. 页面 hook 不记录 body；状态只显示“已捕获课表响应”，不显示课程数据或 Cookie。
6. 用户点击按钮时：
   - 若已有当前会话的有效响应，直接使用最近一次响应；
   - 否则注入一次同源 `fetch` 请求，以传入的 `XNXQDM` 调用课表接口，让 hook 捕获响应；
   - 超时或无效响应时提示用户完成登录并进入/刷新课表详情后重试。
7. 有效响应写入应用 cache 目录的唯一临时 JSON 文件，Activity result 只传文件路径，避免把大 JSON 放入 Android Intent extra；Capacitor bridge 再返回文本给 TypeScript。

### 2.4 现有解析和持久化

返回 Web 层后：

```text
CourseImport.open()
  -> raw response string
  -> getParserById('tianjin-university-of-technology').parse(raw)
  -> useClassStore.importClasses(raw, parser.parse, { firstWeekStartDate })
  -> setSchool / setCurrentWeek / setIsInitialized
  -> existing semester/localStorage persistence
```

不在 Java/Kotlin 中复制 `Class` 模型或课程解析逻辑。Java 只负责安全筛选、会话管理和传输。

## 3. 数据与调用契约

### JS -> Android

```ts
interface CourseImportOpenOptions {
  adapterId: 'tianjin-university-of-technology'
  url: string
  term: string
}
```

- `url` 只用于选择已注册 adapter 的入口，Android 端仍做 host 白名单校验。
- `term` 只用于同源补抓请求的 `XNXQDM`，不用于日志。

### Android -> JS

```ts
interface CourseImportResult {
  data: string // 原始金智 JSON 文本
  sourceUrl: string // 仅用于错误诊断/测试，不含 Cookie
}
```

### 错误契约

错误消息面向用户，至少区分：

- `UNAVAILABLE`：当前不是 Android App 或插件未注册。
- `CANCELLED`：用户返回/取消。
- `INVALID_ADAPTER` / `INVALID_URL`：内部适配配置错误。
- `NOT_LOGGED_IN_OR_NO_SCHEDULE`：未登录、未进入课表页面或没有有效 rows。
- `NETWORK_ERROR`：教务页面加载或补抓失败。
- `PAYLOAD_TOO_LARGE` / `PAYLOAD_READ_FAILED`：响应传输失败。
- `PARSE_ERROR`：Web 层现有解析器无法识别响应。

## 4. 安全设计

- 只允许已注册学校的 HTTPS host；不提供任意网页浏览器或任意 JS 执行入口。
- WebView 的 JS bridge 只接受目标 URL 和课表 JSON 特征；不回传 Cookie、Authorization、表单内容或其他请求。
- 不打印响应正文、账号、Cookie、学号和验证码；错误日志只包含阶段和非敏感 URL path。
- 限制单个响应大小（建议 512 KiB）和单次会话缓存数量；只写应用私有 cache 目录。
- 结果传回 Web 层后删除临时文件；导入取消、Activity 销毁和超时都清理文件。
- `addJavascriptInterface` 暴露给受控 WebView 时，native 端必须重新检查当前页面 host 和目标 URL；不允许通过用户输入扩大白名单。
- 不增加明文 HTTP、远程代理或账号系统，不修改现有网络安全策略。

## 5. 兼容性与降级

- Android Capacitor：使用项目自有 `CourseImportPlugin`，首版提供完整应用内导入。
- 普通浏览器/PWA：`CourseImport.open()` 不可用，UI 不展示 native 选项，继续使用现有书签脚本/JSON 上传。
- iOS：首版不接入；保留 TypeScript 接口，未来可用 WKWebView 实现同一契约。
- 备份导入：不经过 native bridge，保持现有 `useDataExportImport` 行为。
- 原有学校适配：天津工业大学等未实现 native adapter 的学校继续显示原有 parser/书签脚本流程。

## 6. 回滚与运维

- native 选项通过平台和适配器能力检测控制，若 Android bridge 不可用可隐藏并回落到 JSON 流程。
- 保留现有 `bookmarklets/` 文件和解析器，首版不删除旧路径，便于用户和回归测试。
- 若原生构建或真机验证失败，可回滚 UI 对 native 方法的调用，恢复 parser 流程，不影响存量 `localStorage` 数据。
- 不提交 `build/`、APK、cache 文件和机器相关 `local.properties`。
