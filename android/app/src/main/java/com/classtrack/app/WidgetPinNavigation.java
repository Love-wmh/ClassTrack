package com.classtrack.app;

/**
 * 「从应用内把用户送到系统能添加小工具的地方」的**导航判决**与 **vivo 跳转 URI 的唯一拼装点**。
 *
 * <p>本类**只做导航，不做能力判断**：
 *
 * <ul>
 *   <li>小米：跳「创建桌面快捷方式」权限页，失败回退系统应用详情页。（权限开没开**不检测** —— 公开 SDK
 *       里没有 `OP_REQUEST_PIN_SHORTCUT`，想测只能反射 + 硬编码操作码。）</li>
 *   <li>vivo：跳「原子组件库」本应用页面（官方适配指南第 7 节）。</li>
 * </ul>
 *
 * <p>调用方必须把 {@link Step#NONE}（以及 `startActivity` 抛出的任何 `RuntimeException`）当成
 * **什么都没发生**：只记一条诊断，不弹错、不影响任何功能路径。
 *
 * <p>纯逻辑（只用字符串），可被 JUnit 覆盖（见 {@code WidgetPinNavigationTest}）。
 */
public final class WidgetPinNavigation {

    /** vivo 桌面（系统 launcher）的包名。 */
    public static final String VIVO_LAUNCHER_PACKAGE = "com.bbk.launcher2";

    /**
     * 跳转 vivo 原子组件库所需的权限：**在清单里声明即可**（vivo 官方那节写的是「申请权限 （2）使用显式
     * intent」，指的是清单声明，不是平台审批）。只为跳转声明，不授予任何系统能力。
     */
    public static final String VIVO_GALLERY_PERMISSION = "com.bbk.launcher2.permission.JUMP_ORIGIN";

    /**
     * vivo 跳转 URI 里「组件类型」的参数名。
     *
     * <p><b>官方文档在这一点上自相矛盾</b>：同一节正文写「参数需要设置 pkg、classname、<b>cmpType</b>、
     * locType」，而紧跟着的示例代码写的是 `comType`。本实现**依示例代码**取 `comType`，并把名字收敛到
     * 这一个常量上 —— 真机确认（开放项 V5）若发现应为 `cmpType`，只改这一处即可。
     */
    public static final String VIVO_GALLERY_COMP_TYPE_KEY = "comType";

    /** 组件类型取值（官方示例：`comType=0`）。 */
    public static final String VIVO_GALLERY_COMP_TYPE_VALUE = "0";

    /** 位置类型参数名（官方示例：`locType=1`）。 */
    public static final String VIVO_GALLERY_LOC_TYPE_KEY = "locType";

    /** 位置类型取值（官方示例：`locType=1`）。 */
    public static final String VIVO_GALLERY_LOC_TYPE_VALUE = "1";

    /** 一次导航最终该做什么。 */
    public enum Step {
        /** 跳 MIUI 权限编辑页。 */
        MIUI_PERMISSION,
        /** 跳系统「应用详情」页（MIUI 权限页不可解析时的回退）。 */
        APP_DETAILS,
        /** 跳 vivo 原子组件库。 */
        WIDGET_GALLERY,
        /** 什么都不做。 */
        NONE;

        /**
         * @return 传给 Web 的线名（小写），与 Web 侧的联合类型逐字一致。
         *
         * <p>显式列出而不是 `name().toLowerCase()`：Web 的类型是 `'miui_permission' | 'app_details' |
         * 'widget_gallery' | 'none'`，任何一端改名都应当让跨层断言直接看到差异，而不是靠大小写约定去猜。
         */
        public String wireName() {
            switch (this) {
                case MIUI_PERMISSION:
                    return "miui_permission";
                case APP_DETAILS:
                    return "app_details";
                case WIDGET_GALLERY:
                    return "widget_gallery";
                default:
                    return "none";
            }
        }
    }

    private WidgetPinNavigation() {
    }

    /**
     * 小米「创建桌面快捷方式」权限引导的分支判决。
     *
     * <p>顺序即优先级：能跳 MIUI 权限页就跳它（离目标开关最近），否则退到应用详情页（用户至少能顺着
     * 「权限」找到它），两者都不行就 {@link Step#NONE}。
     *
     * @param miuiResolvable MIUI 权限页是否可解析。
     * @param appDetailsResolvable 系统应用详情页是否可解析。
     * @return 三个分支之一，永不抛异常。
     */
    public static Step shortcutPermissionStep(boolean miuiResolvable, boolean appDetailsResolvable) {
        if (miuiResolvable) {
            return Step.MIUI_PERMISSION;
        }
        return appDetailsResolvable ? Step.APP_DETAILS : Step.NONE;
    }

    /**
     * vivo 组件库跳转的分支判决。
     *
     * @param galleryResolvable 组件库 URI 是否可解析。
     * @return 可解析 → {@link Step#WIDGET_GALLERY}；否则 {@link Step#NONE}。
     */
    public static Step galleryStep(boolean galleryResolvable) {
        return galleryResolvable ? Step.WIDGET_GALLERY : Step.NONE;
    }

    /**
     * 拼 vivo 组件库跳转 URI。
     *
     * <p>形态（官方示例，参数值取自官方文档）：
     * `vivo://com.bbk.launcher2/origin?pkg=&lt;包名&gt;&amp;classname=&lt;provider 类名&gt;&amp;comType=0&amp;locType=1`
     *
     * <p>两处有意为之：
     *
     * <ol>
     *   <li>**不做 URL 编码**：包名与类名都是 `[A-Za-z0-9._]`（平台本身就是这么约束的），编码反而可能让
     *       厂商侧解析失败。这个选择由单测钉住。</li>
     *   <li>**用单个 `&amp;` 分隔**：官方示例写作 `&&`（`pkg=xxx&&classname=xxx`），那是文档笔误；`&&`
     *       会凭空多出一个空参数。真机确认（V5）若确实要求 `&&`，改这一处即可。</li>
     * </ol>
     *
     * @param packageName 本应用包名。
     * @param providerClassName 该档 provider 的完整类名。
     * @return 跳转 URI 字符串。
     */
    public static String widgetGalleryUri(String packageName, String providerClassName) {
        String pkg = packageName == null ? "" : packageName;
        String cls = providerClassName == null ? "" : providerClassName;
        return "vivo://" + VIVO_LAUNCHER_PACKAGE + "/origin"
                + "?pkg=" + pkg
                + "&classname=" + cls
                + "&" + VIVO_GALLERY_COMP_TYPE_KEY + "=" + VIVO_GALLERY_COMP_TYPE_VALUE
                + "&" + VIVO_GALLERY_LOC_TYPE_KEY + "=" + VIVO_GALLERY_LOC_TYPE_VALUE;
    }
}
