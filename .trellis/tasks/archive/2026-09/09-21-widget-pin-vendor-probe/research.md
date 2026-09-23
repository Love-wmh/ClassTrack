# 调研：国内主流最新版安卓 OS 的「添加桌面卡片」能力

> 任务 [prd.md](./prd.md) / [design.md](./design.md) / [implement.md](./implement.md)
> 调研日期 2026-09-21。范围：小米 HyperOS、OPPO/一加/realme ColorOS、vivo/iQOO OriginOS、荣耀 MagicOS
> 的**最新版本**。

## 0 证据分级（先看这个）

本轮的每一条结论都标了等级，**不得把 B/C 当 A 用**：

| 等级 | 含义 | 本轮有哪些 |
|---|---|---|
| **A 一手官方原文** | 厂商开发者官网 / AOSP 官网 / 本地 SDK 实证 | 小米小部件技术规范（含官方代码示例）、小米小部件 Q&A、vivo 原子组件技术规范（含官方代码示例）、OPPO 插件卡开发文档、AOSP widget 契约、`javap` 实测 |
| **B 官方文档的官方账号转载** | 厂商官方运营账号发布的文档内容，非官网直读 | 荣耀《安卓卡片(widget card)接入指南》（荣耀开发者服务平台官方 CSDN 账号转载） |
| **C 第三方实测/汇总** | 博客、生产 App 用户文档 | 掘金/CSDN 四厂商行为矩阵、钱迹/知识星球/发车格的手动路径 |
| **✗ 已判定不可信** | 编不过 / 与官方矛盾 | 某篇「用 `AppOpsManager.OP_REQUEST_PIN_SHORTCUT` 检测 MIUI 权限」的文章（见 §1 反例校验） |

**本轮没能读到、仍需真机确认的**：荣耀官网页面的「APP/快应用内一键添加卡片」一节（SPA 抓不到正文）→ 产品口径已决定荣耀**不做能力适配**（只换入口命名文案），故不再阻塞（见 §3.2）。

## 0.9 三家零审核实现方法（本轮主结论，先看这节）

> **口径（2026-09-21，用户）**：一切需要**审核 / 上架 / 审批**的能力一律不用；**荣耀走安卓原生路径、不再调研**。
> 因此本节只回答一件事：**小米 / OPPO / vivo 在零审核前提下，各自有什么官方办法实现「应用内打开添加页 / 直接添加」。**

### 速览

| 系统 | 打开添加页 | 直接添加 | 零审核？ | 证据 |
|---|---|---|---|---|
| 荣耀 | —（走原生 `requestPinAppWidget`） | ✅ | — | 用户口径 |
| **小米 HyperOS** | ✅ `requestPinAppWidget` + extras `addType=appWidgetDetail` → 打开「小部件中心」本应用详情页 | ✅ 同上（用户在该页挑一个添加） | ✅ 官方明确「仅适配安卓原生小部件则**无需通过小米审核**」 | A 级 · [pId=1584](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1584) / [pId=1588](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1588) |
| **vivo OriginOS** | ✅ `vivo://com.bbk.launcher2/origin?pkg=&classname=&comType=0&locType=1` → 跳「组件库」本应用页面 | ⚠️ 官方注明**需原子组件平台审核通过才支持** → **排除** | ✅ 跳转只需在清单声明 `com.bbk.launcher2.permission.JUMP_ORIGIN` | A 级 · [doc/845](https://dev.vivo.com.cn/documentCenter/doc/845) 第 7、8 节 |
| **OPPO ColorOS** | ❌ **翻遍官方文档没有此能力** | ❌ 插件卡需授权码 + 商务审批 → 排除 | — | A 级 · 已核对「负一屏/卡片」「桌面插件卡规范」「桌面1×1插件运营规范」「流体云组件」 |

### 小米：两条官方接口（都能直接用）

**（1）前置探测** —— 官方给了完整示例（A 级）。原文：「部分机型支持小米Widget（包含曝光刷新等特性），但**不支持调起小米Widget 详情页**。这部分机型添加小部件的方式与旧版系统一致。」

```java
Uri uri = Uri.parse("content://com.miui.personalassistant.widget.external");
// 当前机型是否支持小米Widget
Bundle a = getContentResolver().call(uri, "isMiuiWidgetSupported", null, null);
// 当前机型是否支持「小部件详情页」← 决定我们走哪条路
Bundle b = getContentResolver().call(uri, "isMiuiWidgetDetailPageSupported", null, null);
```

这正是「能力探测 + 降级引导」需要的那个探测口，而且是**官方接口**，不是猜的。

**（2）打开添加页** —— 官方示例（A 级）：

```java
Bundle extras = new Bundle();
extras.putString("addType", "appWidgetDetail");
extras.putString("widgetName", "packageName/com.miui.ExampleWidgetProvider"); // 可选，不填定位到第一个
appWidgetManager.requestPinAppWidget(myProvider, extras, null);
```

（另有 `widgetExtraData`，最多 5 个 String，经 `onAppWidgetOptionsChanged` 回传。）

**存疑点（唯一）**：文档说详情页「会包含该 App **通过审核的** Widget」。我们不做小米审核 → 未审核的原生 widget 在详情页里有没有内容，**文档没有正面回答**。可先用上面的 `isMiuiWidgetDetailPageSupported` 探测，再决定是否走这条路。

**（3）同功能多尺寸聚合** —— 对我们 5 档 provider 直接有用。官方原文：「AppWidgetProvider 对应的 receiver 如果 **label 的名称相同**的话将会被认为是同一功能的不同尺寸」，详情页里会聚合显示 → 用户在一个页面里就能选 2×2 / 4×2 / 4×3 / …

### vivo：一条官方跳转 + 一处文档自相矛盾

```java
<uses-permission android:name="com.bbk.launcher2.permission.JUMP_ORIGIN" />

Intent i = new Intent();
i.setPackage("com.bbk.launcher2");
i.setData(Uri.parse("vivo://com.bbk.launcher2/origin?pkg=xxx&&classname=xxx&&comType=0&&locType=1"));
startActivity(i);
```

官方原文（第 7 节）：「应用端内引导用户添加组件到桌面，可以通过跳转的方式，**跳转到组件库该应用适配的所有原子组件的页面**，引导用户添加使用。获得此能力需要：（1）申请权限 …（2）使用显式 intent」
→ 这里的「申请权限」= 在清单里声明该权限，**不是平台审批**。

必须记录的三点：

1. **官方文档自相矛盾**：正文写参数 `cmpType`，示例代码写 `comType`。→ 用具名常量 + 单测钉住 URI 形态，真机确认后一处改完。
2. **存疑点**：未上架的组件是否会在「组件库」里展示 —— 文档未说明。若未上架就不展示，这条跳转对我们同样无效。
3. **不要顺手声明 `vivo_widget`**：小米有明确规则「采用小米 Widget 标识后，该组件**不再出现在安卓原生组件池**」；vivo 文档没写同类规则，但风险同构 → 要有证据才做。

### OPPO：零审核口径下没有方法（这是本轮的真实结论）

已逐块核对 OPPO 官方文档：

| 板块 | 内容 | 可否用于应用内加桌 |
|---|---|---|
| 插件卡开发文档 | CardWidget SDK + `com.oplus.ocs.card.AUTH_CODE` 授权码 + 商务审批 | ❌ 需审批 |
| 桌面1×1插件运营规范 | 只有名称/素材/**跳转规范**（都是运营要求） | ❌ 无 API |
| 桌面/负一屏组件、流体云组件、流体云卡片 | OPPO 卡片模板体系（需接入卡片服务） | ❌ 需接入 |
| 标准 `requestPinAppWidget` | 本仓真机实测（PKR110 / ColorOS / Android 16）：launcher 起了 `AddItemActivity`（`CONFIRM_PIN_APPWIDGET`）但**从不置前**、且不发确认回调 | ❌ 实际无效 |

→ **OPPO 上「应用内加桌」在零审核约束下做不到**，只剩「手动引导」一条路。

**产品决策（2026-09-21，用户）**：OPPO **只做手动引导**（面板不给任何按钮），路径写成「长按桌面 → 『卡片』→ **直接搜索课表**」（D12）。不为 OPPO 破例走插件卡。

## 1 通用契约（AOSP，不可绕过）

A 级，[source.android.com ‹widget 和快捷方式›](https://source.android.com/docs/core/display/widgets-shortcuts?hl=zh-cn)：

- 设备实现者需要在其 launcher 里添加一个带 intent-filter 的 Activity：
  - `android.content.pm.action.CONFIRM_PIN_SHORTCUT`
  - `android.content.pm.action.CONFIRM_PIN_APPWIDGET`
- 该 Activity 向用户显示确认提示，用户接受后把 widget 加进主屏；**widget 场景下 `accept()` 必须带上新 widget 的 id**。
- 合作伙伴需参考 `packages/apps/Launcher3` 的对应改动来更新自己的 launcher。

因此「厂商差异」本质上就是**各 launcher 对这个约定的实现完整度与交互取舍不同**，而不是有别的 API 可走。

本地 SDK 实证（A 级，`/home/yetongy/Android/Sdk/platforms/android-36/android.jar`，`javap`）：

```
android.appwidget.AppWidgetManager:
  public boolean isRequestPinAppWidgetSupported();
  public boolean requestPinAppWidget(android.content.ComponentName, android.os.Bundle, android.app.PendingIntent);

android.appwidget.AppWidgetProviderInfo:
  public int targetCellWidth; public int targetCellHeight;
  public int resizeMode; public int widgetCategory;
  public int maxResizeWidth; public int maxResizeHeight;
```

**反例校验（重要，✗ 级）**：网上流传「用 `AppOpsManager.OP_REQUEST_PIN_SHORTCUT` 检测 MIUI 桌面快捷方式权限」的做法**不可编译** —— 公开 SDK 的 `AppOpsManager` 只暴露 7 个 `public static final int`（全是 `MODE_*` 与 2 个 flag），`OP_*` 操作码常量一律 `@hide`：

```
$ javap -cp android-36/android.jar android.app.AppOpsManager | grep -c "public static final int"
7
```

即该路径必须靠反射 + 硬编码操作码（且各厂商版本不同），属「私有 API 直连」→ **不采用**（design D4）。

## 2 逐厂商行为矩阵

C 级，来源：稀土掘金/CSDN [《安卓AppWidget桌面小组件在国产移动设备的一些适配问题》](https://juejin.cn/post/7511583779578331187)。
**只当起点，不当能力表**（理由见 §5）。

| 厂商 | 是否弹确认框 | 空间不足是否自动新建一页 | 是否触发 PendingIntent 回调 | 其他已知约束 |
|---|---|---|---|---|
| 综合/AOSP Launcher3 | 是 | 是 | 是 | 基准行为（本仓库模拟器已实测通过） |
| 小米 / 红米（HyperOS） | **否** | 是 | 是 | 应用未开启「创建桌面快捷方式」权限时**不会添加到桌面**（静默）——C 级 |
| OPPO / 一加 / realme（ColorOS） | 是 | 是 | 是 | 与本仓库真机实测矛盾（见 §5）：确认页起了但从不置前、且不发回调 |
| vivo / iQOO（OriginOS） | **否** | 是 | 是 | 博客称「不接入原子组件 SDK 并上架审核则无任何效果」→ **该措辞与官方文档不符，见 §3.5** |
| 荣耀 / 华为 | 是 | **否**（提示「当前页面空间不足」） | **否** | 回调不触发（C 级，荣耀侧未复核） |

矩阵外的共同事实（同源，C 级）：

- `requestPinAppWidget` 的返回值只代表「是否支持主动添加」，**与是否真的放下无关**，除极低版本外恒为 `true`。
- 第三个参数（PendingIntent）**成功才触发，失败不触发** → 无法区分「还没加上」与「加不上」，只能靠实例数前后比对（`getAppWidgetIds()`）。
- 同一档 widget 在不同机型的格子占用可能不同（A 机 4×2，B 机 5×3）。
- 各厂商叫法不同：卡片 / 小组件 / 小部件 / 应用挂件 / 磁贴。

## 3 各厂商官方能力（逐家，按证据等级）

### 3.1 小米 HyperOS —— A 级

小米澎湃 OS 官方《小部件技术规范与系统能力说明》
（[pId=1584](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1584)）原文：

> **1、调起小米Widget 商店里的详情页，添加应用的小米Widget**
> **1.2、调用方式** 关键方法 `appWidgetManager.requestPinAppWidget(myProvider, extras, null)`
> 使用 extras 携带参数 `addType: appWidgetDetail`、`widgetName: 小部件name`（可选，用来指定打开详情页后定位到的组件。如果不填，默认定位到第一个）、
> `widgetExtraData`（可选，用于携带自定义参数，携带自定义参数类型只能是 String，最多携带 5 个）。
> **注意：该方法仅支持 Android 8.0 及以上系统。不支持小米Widget 的手机调用 requestPinAppWidget 方法不会调起 Widget 商店里的详情页。**

官方示例代码（节选，`isRequestPinAppWidgetSupported()` 为前置判断）：

```java
if (appWidgetManager.isRequestPinAppWidgetSupported()) {
    Bundle extras = new Bundle();
    extras.putString("addType", "appWidgetDetail");
    extras.putString("widgetName", "packageName/com.miui.ExampleWidgetProvider");
    appWidgetManager.requestPinAppWidget(myProvider, extras, null);
}
```

- 语义：小米上带这组 extras 时**打开「小部件中心」里本应用的详情页**（用户左右滑动预览并选择一个添加），而非标准确认弹窗。
- 风险（**V1**）：文档措辞指向「已通过审核的小米 Widget」；我们**没有**申请小米 Widget 标识 → 对未上架的原生 widget 是否同样生效**未知，必须真机验证**。不生效就回退到 §4 的手动路径。
- 小米官方 Q&A（[pId=1591](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1591)，A 级）：
  - **「小米小部件展示在小部件中心以后，安卓原生组件池里就不会显示这个小部件」** → 采用小米 Widget 标识会让组件从原生池消失。
  - 小米 Widget 需运行在独立进程（`:widgetProvider`）、需上架小部件开放平台并通过审核（上架前要先邮件联系 `miui-widget@xiaomi.com`）。
  - **只有中高端机型且升级到 MIUI13 及以上**才支持小米小部件。
- 生产 App 实测（C 级，[钱迹](https://docs.qianjiapp.com/widget/android.html)）：「MIUI 的桌面小部件，是跟随小米应用商店审核的，所以只有从小米应用商店安装的正式版本才能使用（公测版本不支持）。」
  → **对本项目的直接影响**：CI/beta APK 在小米「小部件」主页**搜不到课表**，必须把用户指向「**安卓小部件**」入口（§4）。
- 结论：**不申请小米 Widget 标识**（D6）；只用官方文档化的 `addType=appWidgetDetail` 作为「小米上优先尝试」的一条并列路径（D5）。

### 3.2 荣耀（MagicOS）—— B 级，本轮**不做专属适配**

荣耀开发者服务平台《安卓卡片(widget卡片)接入指南》（官网 [100170](https://developer.honor.com/cn/doc/guides/100170)，
内容经荣耀官方 CSDN 账号转载）：

> 2.1 **遵循 Google 原生 widget 开发规范**
> 2.2 需在 `AndroidManifest.xml` 中对已声明的 `AppWidgetProvider` 新增 meta-data
> `<meta-data android:name="com.hihonor.widget.type" android:value="honorcard" />`
> 此配置**不影响**荣耀 MagicUI 6.0 以下旧版本手机、其他厂商机型手机上卡片的展示。
> 2.3 集成 YOYO 建议 SDK（可选）。
> 另有独立章节「APP/快应用内一键添加卡片」（官网 SPA 抓不到正文，未读到）。

- 结论：**荣耀 = 官方 Android API 原样可用**，`honorcard` 标识只影响是否进入荣耀快服务中心/智慧服务等入口，对卡片本身在桌面上的展示没有影响。
- **产品口径（2026-09-21，用户）**：荣耀按官方 API 支持处理，**不做能力适配**（design D10）：不加 extras、不加提示、不改任何探测逻辑；**只把引导句换成荣耀自己的入口命名**（「服务卡片 / 桌面卡片」→「窗口小工具 / 经典小工具」），因为「小工具」这个叫法在荣耀上会让用户找不到入口。
- 代价与已知项：C 级矩阵称华为/荣耀类**不发确认回调**、**空间不足不自动翻页**。本轮用「无回调复核」（T3）覆盖前者的功能影响，文案上不再单独提示后者。

### 3.3 OPPO / 一加 / realme（ColorOS）—— A 级

[OPPO 开放平台 ‹插件卡开发文档›](https://open.oppomobile.com/documentation/page/info?id=11733) 原文（已用浏览器直读）：

> 「插件卡接入服务是 OPPO 提供给三方应用开发卡片的开放接口。**相较于原生 AppWidget 具有许多优势**，这其中包括：支持动画、支持自定义控件、支持播放视频、更灵活的控件属性定制、更完善的生命周期、可以在桌面和负一屏同时添加卡片。」

一手事实：

- 体系名：**CardWidget** SDK，`版本号 1.2.3-external`，需从开放平台下载 zip。
- 接入需**申请授权码**：`<meta-data android:name="com.oplus.ocs.card.AUTH_CODE" ...>`（多签名要分别申请），路径是「管理中心-应用服务平台-开发服务-Card」→ 申请授权码 → **联系商务协调对接人审批**。
- 组件不是 `AppWidgetProvider`，而是 `<provider>` + `android.appcard.action.APPCARD_UPDATE` + `android.card.provider` 指向配置文件；
  **SDK 已限定调用包名为 `com.coloros.assistantscreen`**。
- 卡片尺寸只有三档：`two2two`(2×2) / `two2four`(4×2) / `four2four`(4×4)，尺寸是**申请时登记**的（`oplus_card_type` 是唯一标识，需申请后使用）。
- 未正式上线前只能靠切换负一屏测试环境才能看到卡片。

- 结论：这是**另一套需要申请 + 审批 + 上架**的卡片体系，不是 `AppWidget` 的适配项 → 本轮不接入（§6）。
- ColorOS 的真实现场（A 级，本仓库真机证据，见 §5）：`AddItemActivity` 起了却从不置前、且**不发确认回调** → 证明「按厂商硬编码能力表」必然翻车（D3）。

### 3.4 vivo / iQOO（OriginOS）—— A 级，**重要修正**

[vivo 开放平台 · 原子组件技术规范](https://dev.vivo.com.cn/documentCenter/doc/845) 原文（已用浏览器直读，更新时间 2024-11-15）：

> **简介**：vivo原子组件是以vivo定制化挂件为载体，在OriginOS平台运行的小部件（挂件）。
> **1.2 适配方式**：在 Manifest 文件中定义 vivo 属性以便于读取配置实现相关功能，**方式和原生 AppWidget 相同**，只需要增加相关 meta-data 标识区分。

必配 meta-data（**不需要任何 SDK**）：

| 字段 | 说明 |
|---|---|
| `vivo_widget` | 原子组件标识（`true`） |
| `vivoWidgetVersion` | 正整数，从 1 开始，只能升高 |
| `vivo.widget.description` | 原子组件库详情页的描述语 |

> **8、应用端内一键添加到桌面**
> 8.1 描述：应用端内引导用户添加组件到桌面，可以直接一键添加到桌面 …… **但是该能力需要经过原子组件平台审核并测试通过才支持。**
> 8.2 适配方式：**Android原生的方式支持**，通过 PinRequest 的方式 …… **Android原生的：PinAppWidget `requestPinAppWidget()`**
> （官方给出了 `isRequestPinAppWidgetSupported()` + `requestPinAppWidget(componentName, null, successCallback)` 的完整示例代码）
> 发送请求后，添加成功通过广播返回结果，代表一键加桌成功。
> 回调广播示例：`int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);`
> `String from = intent.getStringExtra("from");`（**vivo 自定义**，`launcher` 代表桌面）
> `ComponentName provider = intent.getParcelableExtra("provider");`（**vivo 自定义**）
> **注意：需要审核通过上架后才有该功能**

> **7、原子组件跳转组件库详情页**
> 应用端内引导用户添加组件到桌面，可以通过跳转的方式，跳转到组件库该应用适配的所有原子组件的页面，引导用户添加使用。
> 需要：（1）申请权限 `<uses-permission android:name="com.bbk.launcher2.permission.JUMP_ORIGIN"/>`
> （2）显式 intent：`vivo://com.bbk.launcher2/origin?pkg=xxx&&classname=xxx&&comType=0&&locType=1`（`setPackage("com.bbk.launcher2")`）

> **9.1 ResizeMode失效**：安卓原生组件支持通过 `android:resizeMode` 设置拖拽大小，但**原子组件不支持该特性**。

**修正**：C 级博客说的「不接入 vivo 原子组件 SDK 则此方法无任何效果」**措辞不准确** —— 官方文档明确写的是：
1. 适配**不需要 SDK**，只需 meta-data；
2. 一键加桌用的就是 **Android 原生 `requestPinAppWidget`**；
3. 真正的**前置条件是「经过原子组件平台审核并测试通过（上架）」**。博客把「上架审核」说成了「SDK」。

vivo 上的三条可选路径（按可靠性排序）：

| # | 路径 | 前置条件 | 本轮是否纳入 |
|---|---|---|---|
| 1 | `requestPinAppWidget`（官方推荐） | 组件**上架审核通过** | 纳入（本就在链路上），但**不能承诺在未上架前可用** |
| 2 | 跳转组件库详情页（`vivo://com.bbk.launcher2/origin?...`） | 声明 `com.bbk.launcher2.permission.JUMP_ORIGIN` 权限 | **待定（V5）**，见 prd |
| 3 | 手动「长按桌面 → 组件 → 应用挂件」（§4） | 无 | 纳入（降级引导） |

**附带发现（属另一个任务的范围，此处只登记）**：vivo 原子组件**不支持 `android:resizeMode` 拖拽改尺寸** → 与 `09-21-widget-scope-narrowing` 的「拖动改尺寸自动匹配」在 vivo 上不适用。

### 3.5 厂商卡片生态对照（A/B 级）

| 厂商 | 体系名 | 是否另一套 SDK | 是否需申请/审批/上架 | 是否需要独立标识 |
|---|---|---|---|---|
| 小米 | 小米小部件 | 否（原生 AppWidget + 规范） | **是**（小部件开放平台审核；上架前先邮件） | `miuiWidget` 标识（采用后从原生池消失） |
| OPPO | 插件卡 CardWidget | **是**（独立 SDK + Provider action） | **是**（授权码 + 商务审批） | `oplus_card_type`（申请后使用） |
| vivo | 原子组件 | 否（原生 AppWidget + meta-data） | **是**（原子组件平台审核上架） | `vivo_widget=true` + `vivoWidgetVersion` |
| 荣耀 | 服务卡片 / 快服务 | 否（遵循 Google 原生规范） | 是（若要进快服务中心） | `com.hihonor.widget.type=honorcard` |

→ 除荣耀外，**三家的「厂商加强能力」都以审核上架为前置**；本轮只做「不依赖上架」的部分（标准 pin + 引导）。

## 4 手动添加路径（按厂商，用于降级引导文案）

C 级，两个**互相独立**的生产 App 文档结论一致，故可直接写进 UI：

| 厂商 | 入口命名 | 完整路径 |
|---|---|---|
| 小米 / 红米 | 小部件 | 桌面双指捏合（或长按空白处）→ 底部「小部件」→ 小部件中心点「搜索」→ 进「**安卓小部件**」→ 找到课表 → 拖到桌面 → 右上角「√」 |
| OPPO / 一加 / realme | 卡片 → 搜索 | 长按桌面空白处 → 桌面编辑页 → 「卡片」→ **直接搜索「课表」**（产品口径 2026-09-21）；搜不到再滑到底找「插件」 |
| vivo / iQOO | 组件 → 应用挂件 | 长按桌面空白处 → 桌面编辑页 → 「组件」→ 底部「**应用挂件**」→ 下滑找到课表 → 选样式 |
| 荣耀 | 服务卡片 / 窗口小工具 | 桌面双指捏合 → 编辑页 → 「服务卡片」（新版本为「桌面卡片」）→ 滑到底 → 「**窗口小工具 / 经典小工具**」→ 找到课表 |
| 其他 / 老系统 | 小工具 / 小组件 | 长按桌面空白处 → 「小工具 / 小组件」→ 找到课表（既有通用句） |

来源：
- [钱迹 Android 桌面小组件](https://docs.qianjiapp.com/widget/android.html)（小米 / ColorOS / vivo / 华为四段分别写）
- [知识星球桌面小组件指南](https://doc.zsxq.com/desktop-widget-guide.html)（四行速查）
- 小米「安卓小部件」入口另有第三方 App 文档佐证：[发车格](https://f1push.com/widgets.html)
- 荣耀侧入口命名另有荣耀官方帮助页（honor.com ‹服务卡片›）

> 既有文案 `WIDGET_PIN_MANUAL_STEPS`（「长按桌面空白处 → 小工具 → 找到课表 → …」）在小米/OPPO/vivo 上**都是错的指路**。

**荣耀为何仍保留一条文案**：产品口径是「不为其做专属适配」，但荣耀的**入口命名**与通用句差异很大（「小工具」在荣耀上叫「服务卡片 / 窗口小工具」），所以仍给它一条 C 级文案（D11），只是**不涉及任何能力判断与 extras**。

## 5 与本仓库既有真机证据的对照（A 级）

`.trellis/tasks/archive/2026-09/09-21-widget-pin-confirm/verification.md` 已记录（2026-09-21）：

| 环境 | `AddItemActivity`（`CONFIRM_PIN_APPWIDGET`）是否启动 | 是否置前 | 桌面结果 | 确认回调 |
|---|---|---|---|---|
| 真机 PKR110 / ColorOS / Android 16 | 是 | **从未**（`mCurrentFocus` 始终是本 App） | 实例数不变 | **0 条**（`grep -c pin_confirmed` = 0） |
| AOSP 模拟器（Launcher3 / Android 16） | 是（`QuickstepAddItemActivity`） | 是 | 放下了（新实例） | 有，但 `EXTRA_APPWIDGET_ID` 发成 `0` |

对照 §2 矩阵：C 级口径说 OPPO「弹确认框 = 是」，而我们的 A 级真机实测是「起了确认页却从不置前」。
**这正好说明矩阵只能当起点**：同一家不同 ROM 版本行为会漂移，因此实现必须靠**运行时行为探测**，而不是把矩阵硬编码成能力表（design D3）。

## 6 明确不覆盖的范围与理由

| 不做的项 | 理由 |
|---|---|
| 鸿蒙 NEXT（纯鸿蒙） | 不是 Android，无 `AppWidget` 体系；产品口径为「后续专门做鸿蒙原生版」 |
| MIUI 13/14（A12/A13）、realme UI 3/4、Funtouch OS 13 等老系统 | 产品口径「不适配老系统」；这些版本的 launcher 与最新版行为差异大，厂商专属文案对它们大概率是错的 |
| 小米小部件标识 + 小部件开放平台审核上架 | 需要独立进程 + 审核 + **会让组件从原生组件池消失**（A 级官方 Q&A） |
| OPPO 插件卡 CardWidget SDK | 需授权码 + 商务审批 + 另建 Provider 体系（A 级官方文档） |
| vivo 原子组件平台审核上架 | 需走平台审核流程，是独立产品决策，不是本轮的适配工作 |
| 荣耀 `honorcard` 标识 / 快服务中心 | 产品口径「保持现有」 |
| 私有 launcher Intent / 反射 AppOps 的能力探测 | 未文档化或不可编译，属「私有 API 直连」（§1 反例校验） |

> 注意区分：vivo 的「跳转组件库详情页」虽然用 `vivo://` 私有 scheme，但它**写在 vivo 官方适配指南里**（A 级），性质上与「逆向出来的私有 API」不同 —— 是否纳入由 V5 决定。

## 7 来源清单

**A 级 · 厂商官方原文（浏览器直读 / 官方文档）**
1. 小米澎湃 OS ‹小部件技术规范与系统能力说明› — https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1584 ✅ 已直读全文
2. 小米澎湃 OS ‹小部件适配常见问题Q&A› — https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1591 ✅ 已直读全文
3. vivo 开放平台 ‹原子组件技术规范› — https://dev.vivo.com.cn/documentCenter/doc/845 ✅ 已直读全文（浏览器渲染）
4. OPPO 开放平台 ‹插件卡开发文档› — https://open.oppomobile.com/documentation/page/info?id=11733 ✅ 已直读全文（浏览器渲染）
5. AOSP ‹widget 和快捷方式› — https://source.android.com/docs/core/display/widgets-shortcuts?hl=zh-cn ✅
6. Android Developers ‹微件可检测性› — https://developer.android.com/develop/ui/views/appwidgets/discoverability?hl=zh-cn
7. 本地 SDK `javap` 实测 — `/home/yetongy/Android/Sdk/platforms/android-36/android.jar`

**B 级 · 官方账号转载**
8. 荣耀开发者服务平台 ‹安卓卡片(widget卡片)接入指南›（官网 [100170](https://developer.honor.com/cn/doc/guides/100170)；内容经荣耀官方 CSDN 账号转载）— https://blog.csdn.net/HONOR_Developer/article/details/126829344
   ⏳ 官网章节「APP/快应用内一键添加卡片」未读到（SPA）

**C 级 · 第三方实测**
9. 稀土掘金《安卓AppWidget桌面小组件在国产移动设备的一些适配问题》 — https://juejin.cn/post/7511583779578331187
10. 同文 CSDN 镜像 — https://blog.csdn.net/qq_41904106/article/details/147627142
11. 钱迹用户指南 · Android 桌面小组件（四厂商路径） — https://docs.qianjiapp.com/widget/android.html
12. 知识星球 ‹使用桌面小组件› — https://doc.zsxq.com/desktop-widget-guide.html
13. 发车格 ‹桌面小组件添加指南›（HyperOS「安卓小部件」入口） — https://f1push.com/widgets.html
14. Stack Overflow ‹Widget pinning not working with Android Huawei and Vivo devices› — https://stackoverflow.com/questions/72492999/

**✗ 已判定不可信**
15. 《MIUI系统特定应用权限查询及桌面快捷方式权限检测问题》 — https://www.volcengine.com/article/97392
    理由：给出的 `AppOpsManager.OP_REQUEST_PIN_SHORTCUT` 在公开 SDK 中不存在，示例代码编译不过（§1）。

**本仓库既有证据**
16. `.trellis/tasks/archive/2026-09/09-21-widget-pin-confirm/verification.md`（真机 + 模拟器对照）

## 8 待确认的开放项

| # | 待验证 | 影响 | 谁能验 |
|---|---|---|---|
| V1 | 小米 HyperOS：`extras(addType=appWidgetDetail)` 对**未上架审核的原生 widget** 是否也能打开详情页 | 决定小米「优先尝试」分支保留还是只留手动引导 | 小米真机/云真机 |
| V2 | 荣耀 MagicOS 最新版是否真的**不发确认回调** | 决定无回调复核在荣耀上是必需还是冗余 | 荣耀真机 |
| V3 | 小米 HyperOS：「创建桌面快捷方式」关闭时 pin 是否**确实静默无效** | 决定权限提示文案强度（「会失败」/「可能失败」） | 小米真机 |
| V4 | 四家最新版实际入口文案是否与 §4 一致 | 决定厂商文案字面正确性 | 各家真机 |
| **V5** | vivo：「跳转组件库详情页」**已决定纳入**（prd R9 / design D11）；待验的是 —— 未上架状态下该跳转是否真能打开、以及参数名到底是官方示例代码里的 `comType` 还是正文里的 `cmpType`（**官方文档自相矛盾**，见 design D11） | 决定 vivo 引导是「一键跳组件库」还是退回纯文案；参数名写错则整条路径静默失效 | vivo 真机（看是否 `resolveActivity` 可解析 + 是否真的打开组件库） |
| **V6** | vivo：未上架审核时 `requestPinAppWidget` 的真实表现（被静默丢弃？还是有确认框但加不上？） | 决定 vivo 是否需要在点按前就改口为「引导」 | vivo 真机/云真机 |
