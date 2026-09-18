# 实施计划：Android 内嵌 WebView 金智课表导入

## 前置与范围

- 当前分支：`feat/in-app-jinzhi-import`。
- 只在用户明确批准本次规划摘要后执行 `task.py start` 并修改产品代码。
- 首版目标是 Android Capacitor 应用内导入；Web/PWA 保留现有书签脚本/JSON 降级；iOS 不在本次实现。
- 不引入 `@capacitor/browser`、浏览器扩展、油猴脚本依赖或服务端代理。

## 有序清单

### A. 任务上下文与基线

1. 执行 `python3 ./.trellis/scripts/task.py validate <task-dir>`，确认 PRD、设计和上下文清单完整。
2. 创建/切换实现分支（已完成），开始实现前再次确认 `git branch --show-current` 和 `git status`。
3. 加载 `trellis-before-dev`，按前端层规范复核导入向导、解析器、状态 slice 和 Android 工程边界。
4. 在修改前运行最小基线：`pnpm test`、`pnpm typecheck`、`pnpm lint`；记录任何与本任务无关的既有失败。

### B. Web/TypeScript 平台适配

5. 新增 `app/lib/native-course-import.ts`：定义 `CourseImportOpenOptions`、`CourseImportResult`、错误映射和 `registerPlugin('CourseImport')`；Web 实现拒绝调用。
6. 在 `app/lib/types.ts` 或现有 UI 类型边界中扩展 `ImportMethod` 为 `native-webview`，同时保持备份和 parser 分支的类型收窄。
7. 在 `app/lib/bookmarklets` 或独立 adapter 配置中补充天津理工的原生入口/适配器元数据，复用现有入口、学期解析和学校 ID，不复制解析器字段映射。
8. 在 `ImportSchoolStep.tsx` 根据运行平台和学校能力显示“应用内导入”；浏览器/PWA 不显示该选项，天津理工以外学校不显示未实现的 native 选项。
9. 新增 `app/components/import-flow/InAppImportStep.tsx`：展示学期代码输入、登录/进入课表详情说明、无插件提示和当前状态。
10. 扩展 `useImportFlow.ts`：增加 native steps、按钮状态、取消/异常处理和成功回写；收到 raw JSON 后复用 `getParserById`、`importClasses`、`setFirstWeekStartDate`、`getCurrentRealWeek`、`setSchool`、`setIsInitialized`。
11. 保持 `BookmarkletInstallStep`、`BookmarkletRunStep` 和 parser JSON 上传路径可用；只在原生能力不可用时把 native 选项隐藏，不删除旧适配器。
12. 为原生调用参数、平台检测、错误映射和“native 不可用时不改变 parser 流程”补充 `*.test.ts` 纯逻辑测试；必要时将 adapter capability 判定抽成可测试函数。

### C. Android 项目自有 bridge 与 WebView

13. 新增 `CourseImportPlugin.java`，注册 `CourseImport`，校验 adapter、HTTPS、host 白名单和 term，使用 Capacitor 8 Activity Result API 启动 `CourseImportActivity`。
14. 在 `MainActivity.java` 中于 Capacitor bridge 创建前注册 `CourseImportPlugin`，保证 `registerPlugin('CourseImport')` 在 Android WebView 中拥有 native header/方法。
15. 新增 `CourseImportActivity.java` 和对应布局/资源：WebView、返回/刷新、进度、捕获状态、“导入当前课表”按钮、错误提示；处理返回键、取消、重复点击和 Activity 销毁。
16. 在 `AndroidManifest.xml` 声明 `CourseImportActivity` 为 `exported=false`；不增加明文 HTTP 或宽泛外部组件暴露。
17. 新增捕获脚本/响应验证工具：幂等 hook `XMLHttpRequest` 与 `fetch`，只发送目标金智课表接口；验证 host/path/JSON markers/rows/大小；不记录正文、Cookie 或账号信息。
18. 在用户点击导入时优先使用当前会话最新有效响应；没有候选时在当前教务页面上下文发起带 `XNXQDM` 的同源补抓请求；超时/登录页/空 rows 显示可行动提示。
19. 将有效 raw JSON 写入应用私有 cache 临时文件，Activity result 仅传文件路径；插件读取后删除文件并将 `{ data, sourceUrl }` resolve 给 Web 层；所有取消/异常/超时路径清理临时文件。
20. 添加 Android 本地单元测试（若当前 Gradle 测试环境可用）覆盖目标 URL 判断、有效/无效 payload、空 rows、超限和敏感内容不输出；若无法运行，保留静态验证与手工测试记录，不绕过 Web 测试门禁。

### D. 文档与交互回归

21. 更新 `docs/书签脚本导入系统设计方案.md`：说明 Android 应用内捕获为首选、书签脚本是 Web/PWA 降级，写清楚同源限制和安全边界。
22. 更新 `README.md` 的导入说明：Android App 的应用内流程、浏览器/PWA 的降级流程和不需要账号托管/外部插件的边界。
23. 检查所有 `ImportMethod` 分支、步骤数量、按钮禁用条件和学校选择文案，确保新增联合类型没有静默 fallthrough。

### E. 质量门禁与人工验证

24. 前端门禁：`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`。
25. Android 门禁：`pnpm cap:sync:android`、`pnpm cap:build:android`；若环境缺少 JDK/SDK，记录命令和完整错误，不修改代码规避。
26. 在 Android 真机/模拟器手工验证：打开导入 → 进入金智页面 → 登录/验证码 → 进入课表详情 → 点击导入当前课表 → 回到 ClassTrack；验证课程、周次、教师、教室、节次和学期切换。
27. 手工验证错误路径：未登录、空课表、刷新重试、返回键、取消、重复点击、网络失败、登录页重定向、WebView 旋转/重建；确认不输出密码/Cookie/响应正文。
28. 在普通浏览器/PWA 验证：native 选项不出现，现有书签脚本 JSON 上传和备份导入仍可用。
29. 运行 `git diff --check`，检查 `git status --short`，确认没有 build、APK、local.properties、cache 或外部临时文件被纳入改动。
30. 使用 `trellis-check` 做完整 spec/跨层审查；根据审查结果修复后重复第 24-29 步。
31. 使用 `trellis-update-spec` 判断是否需要将本次 WebView/Capacitor 导入边界、安全约束或适配器规范写回 `.trellis/spec/`；仅在确有可复用新约定时更新。
32. 最终确认用户验收标准、测试结果和分支状态后提交 commit；提交前不得把未验证的 Android 真机成功描述为已完成。

## 验证命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm cap:sync:android
pnpm cap:build:android
git diff --check
python3 ./.trellis/scripts/task.py validate .trellis/tasks/09-18-improve-jinzhi-schedule-import
```

## 高风险文件与回滚点

| 文件/区域 | 风险 | 回滚点 |
|---|---|---|
| `app/components/import-flow/useImportFlow.ts` | 步骤索引和导入分支容易互相影响 | 保留 `backup`/`parser` 原分支，native 独立分支可整体撤回 |
| `app/store/slices/uiSlice.ts` | `ImportMethod` 联合类型扩展可能漏分支 | 只增加联合成员，不改变持久化业务数据 |
| `app/lib/native-course-import.ts` | Web/native 平台检测或 bridge 名称不一致 | Web 实现始终拒绝，native 选项可隐藏 |
| `android/app/src/main/java/com/classtrack/app/*` | Activity Result、WebView 生命周期和 JS bridge | 删除 native Activity/插件注册，React 回落 parser 流程 |
| `android/app/src/main/AndroidManifest.xml` | 组件暴露或网络策略错误 | 只新增 `exported=false` Activity，不改现有主 Activity |
| `docs/`、`README.md` | 文档与实际 UX 不一致 | 代码验证后再合并文案 |

## Verification record

- Frontend checks passed: `pnpm test` (5 files / 19 tests), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm cap:sync:android`, `git diff --check`, and task context validation.
- Android `./android/gradlew -p android test` / `pnpm cap:build:android` could not run to compilation in this environment: the default Gradle home is read-only; a writable `GRADLE_USER_HOME` then failed to download Gradle 8.14.3 from `services.gradle.org` with `UnknownHostException`. No Android compiler or SDK is available locally, so Java/manifest compilation remains a release-machine check.
- No real教务账号/模拟器 is available in this environment; login redirects, CAPTCHA, schedule navigation, and end-to-end response capture remain manual Android acceptance checks.
## Review gates before `task.py start`

- [x] 已完成开源项目和本仓库证据调研并写入 `research/`。
- [x] 用户已确认 Android 优先、Web/PWA 保留降级的范围决策。
- [x] 已创建独立分支 `feat/in-app-jinzhi-import`。
- [x] 已形成 `prd.md`、`design.md`、`implement.md`。
- [x] `implement.jsonl` 与 `check.jsonl` 已填入真实 spec/research 条目。
- [x] 用户明确批准本最终规划摘要后，已运行 `task.py start`。
