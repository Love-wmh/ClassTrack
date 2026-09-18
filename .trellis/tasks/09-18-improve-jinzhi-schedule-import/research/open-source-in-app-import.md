# 无外部插件的课表导入调研

## 调研目标

确认 ClassTrack 是否可以在不依赖浏览器书签脚本、油猴脚本或第三方 Capacitor 浏览器插件的情况下，在应用内部打开金智教务系统并取得课表详情；同时比较其他开源课表项目的实现方式。

## 仓库内现状

- `app/components/import-flow/useImportFlow.ts` 将学校导入流程固定为“安装脚本 → 打开课表页 → 上传 JSON”四步。
- `app/components/import-flow/BookmarkletInstallStep.tsx` 与 `BookmarkletRunStep.tsx` 明确要求用户安装并执行书签脚本。
- `app/lib/bookmarklets/tianjin-university-of-technology/script.ts` 在教务页面上下文中向 `/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do` 发起 POST，请求参数为 `XNXQDM`，再下载原始 JSON。
- `app/lib/parsers/tianjin-university-of-technology/parser.ts` 已经可以解析 `datas.cxxszhxqkb.rows`，字段包括 `KCM`、`SKJS`、`JASMC`、`SKXQ`、`KSJC`、`JSJC`、`SKZC`、`XNXQDM` 等。因此主要缺口是“在登录态中取得响应”，不是课程模型解析。
- 项目已包含 Capacitor Android，但 `MainActivity` 仍是空的 `BridgeActivity` 子类，当前没有导入专用原生页面或 JS bridge。
- 当前依赖中没有 `@capacitor/browser` 等外部浏览器插件。

## 开源项目对比

### 1. baoozak/timetable（下节啥课）

仓库：<https://github.com/baoozak/timetable>

README 明确说明它使用 WebView 内嵌教务系统登录，并自动抓取课表。关键实现位于：

- <https://github.com/baoozak/timetable/blob/main/pages/import/import.vue>
- <https://github.com/baoozak/timetable/blob/main/utils/parsers/wisedu.js>

实现要点：

1. App 端使用内嵌 WebView 加载学校入口。
2. 在 WebView 页面中注入学校适配脚本。
3. 脚本识别金智课表 DOM，或从页面文本中提取 JSON 标记。
4. 通过 `document.title` 传递 `KEBIAO_OK:*` / `KEBIAO_ERR:*` 结果给原生层。
5. 原生层解析紧凑结果并写入本地课表。

这证明“内嵌网页 + 页面内执行采集逻辑 + 原生回传”的产品形态可行，但该项目依赖 uni-app 的 `plus` 原生 API，不适合直接复制到 ClassTrack 的 React/Capacitor 架构。

### 2. JFyuhong/JLU_schedule

仓库：<https://github.com/JFyuhong/JLU_schedule>

关键实现：

- <https://github.com/JFyuhong/JLU_schedule/blob/master/app/src/main/java/cn/jlu/schedule/ui/importer/ImportBrowserActivity.kt>
- <https://github.com/JFyuhong/JLU_schedule/blob/master/app/src/main/java/cn/jlu/schedule/parser/ScheduleImportCacheParser.kt>
- <https://github.com/JFyuhong/JLU_schedule/blob/master/app/src/main/java/cn/jlu/schedule/parser/DoScheduleParser.kt>

实现要点：

1. 使用独立 Android `WebView` 页面承载登录和网页导航，而不是让用户跳出应用。
2. 在 `onPageFinished` 后注入 JavaScript。
3. 同时 hook `XMLHttpRequest` 和 `fetch`，把响应文本通过 `addJavascriptInterface` 暴露的桥接对象回传给 Kotlin。
4. 原生侧按 URL 和 JSON 特征筛选疑似课表响应，例如 `cxxszhxqkb.do`、`modules/xskcb`、`"datas"`、`"rows"`、`"KCM"`、`"YPSJDD"`/`"SKXQ"`。
5. 将捕获响应缓存到当前导入会话的私有目录，点击“从此处导入”后等待异步缓存写入完成，再选择最新且学期一致的响应解析。
6. 将网页浏览、网络捕获、候选筛选、解析和写入分成独立职责，并为缓存解析器提供单元测试。

该方案比单纯读取 DOM 更适合金智系统，因为金智课表数据常由 AJAX/fetch 异步加载，且接口响应包含完整字段。

### 3. Yorick-Ryu/NIIT_getCourse

仓库：<https://github.com/Yorick-Ryu/NIIT_getCourse>

README 同时尝试 HTML 抓取和 `fetch` 抓取金智课表，并明确记录：由于后端禁止跨域，单独从外部页面发起 fetch 会受到跨域限制；因此仍要求用户先登录并进入课表页面。

结论：在普通 Web/PWA 页面中，不能依赖 ClassTrack 自己的 `fetch` 直接访问教务系统；请求必须发生在教务系统页面上下文、同源的 WebView 页面，或经过受控的原生网络层。

### 4. WanderLandWalker/SCUT_Lesson_Table

仓库：<https://github.com/WanderLandWalker/SCUT_Lesson_Table>

README：<https://github.com/WanderLandWalker/SCUT_Lesson_Table#技术实现>

该项目通过 hook `jQuery.ajax` 拦截教务页面发起的课程 JSON 请求，强调拦截接口比解析 DOM 更完整可靠。该思路与 JLU_schedule 的 XHR/fetch hook 一致，可作为金智适配器的采集策略参考。

### 5. CreamPig233/neu_wisedu2wakeup

仓库：<https://github.com/CreamPig233/neu_wisedu2wakeup>

该项目以金智系统为例，将课表转换为 WakeUp CSV，同时提示较新版本 WakeUp 已支持直接从教务系统导入。它说明金智课表的通用中间件需求真实存在，但 CSV 中间件仍需要用户在两个应用之间导入，不符合本次减少操作步骤的目标。

## 技术结论

### 结论 A：普通 Web/PWA 无法可靠实现“应用内读取教务页面”

ClassTrack 的页面与 `jwxt.tjut.edu.cn` 不同源。iframe、Service Worker 或 ClassTrack 自己的 `fetch` 都不能绕过教务系统的同源策略/CORS 限制，也不能直接读取跨源 DOM 或 Cookie。继续在纯 Web 环境提供“书签脚本/上传 JSON”作为降级方案是必要的。

### 结论 B：Capacitor Android 可以不引入外部插件实现

当前 Capacitor Android 工程允许在项目自身的 `android/app` 中增加一个原生导入页面和桥接能力。实现不需要 `@capacitor/browser` 或油猴插件：

- 原生 `WebView` 负责登录、导航和 Cookie。
- 项目自有 Android 代码负责注入 XHR/fetch hook、接收响应、筛选和返回结果。
- React 页面通过项目自有的 Capacitor bridge 调用原生导入流程，返回原始 JSON 或标准化课程数据。

这与 JLU_schedule 的独立 `ImportBrowserActivity` 方向一致；与 WakeUp/下节啥课的“网页在应用内、导入按钮在页面上”体验也一致。

### 结论 C：优先捕获接口响应，不把 DOM 解析作为天津理工首选

天津理工现有书签脚本已经验证了接口地址、POST 参数和响应结构。新方案应优先：

1. 打开 `https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do`。
2. 用户在内嵌 WebView 完成登录并进入课表页面。
3. 注入 hook 捕获 `/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do` 的响应。
4. 用户点击“导入当前课表”后，将最近一次有效 `datas.cxxszhxqkb.rows` 响应交给已有 TypeScript 解析器。
5. 若页面未发起目标请求，提供“刷新课表/切换学期后重试”的明确提示；DOM 解析可作为后续适配能力，不应在首版同时引入。

## 主要风险与待确认事项

- Capacitor Android 原生 bridge 的实现边界需要明确：是只支持 Android App，还是还要为 Web/PWA 设计同等体验。普通 Web/PWA 无法具备相同能力。
- 教务系统页面可能在 `onPageFinished` 后继续执行脚本，因此 hook 需要幂等注入，并在页面跳转后重新注入。
- 登录页、验证码、二级菜单和学期切换都必须保持在同一个 WebView Cookie 会话中。
- JS bridge 不能把账号密码、Cookie 或非目标响应写入日志；原始课表响应只在内存中短暂传递，除非确有必要才写入应用私有临时文件。
- 应限制捕获响应的 URL、大小和数量，避免把整个 WebView 的敏感网络流量回传给业务层。
- Android 原生导入页需要处理返回键、旋转/配置变化、网络错误、SSL 错误和重复点击。
