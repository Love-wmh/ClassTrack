package com.classtrack.app;

import android.appwidget.AppWidgetManager;

/**
 * 「这次 pin 该带哪些 `extras`」的**纯决策**，以及与 {@link android.os.Bundle} 的机械落地。
 *
 * <p><b>为什么把决策与落地分开</b>：`Bundle` 是 Android 类型，纯 JUnit 跑不了；而「小米上到底带不带那组
 * extras」正是本轮最需要被测试钉住的东西（带错了要么打不开详情页、要么在别家触发未知行为）。所以
 * {@link Plan} 只装纯数据、{@link #apply} 只做四行机械写入，测试用假 {@link Sink} 就能覆盖全部组合。
 *
 * <p><b>尺寸键恒定带上</b>：`OPTION_APPWIDGET_MIN_WIDTH/HEIGHT` 是尽力而为的尺寸提示（spec 已记录
 * AOSP Launcher3 会忽略它），与小米无关，所以在所有分支里都带。
 *
 * <p><b>小米那组 extras 不替代标准 pin</b>：它只是**多带两个键**；`successCallback`、基线记录、三段探测
 * 全部照旧执行。理由是官方文档只保证「打开详情页」，而详情页对**未上架审核**的原生 widget 有没有内容
 * 是未知的（见 prd 的开放项 V1）——真不生效也只是退回标准 pin，不会更差。
 */
public final class WidgetPinExtras {

    /** 小米文档化的 extras 键：决定「打开详情页」还是走标准确认框。 */
    public static final String KEY_ADD_TYPE = "addType";

    /** {@link #KEY_ADD_TYPE} 的取值：打开小部件中心里本应用的详情页。 */
    public static final String ADD_TYPE_WIDGET_CENTER_DETAIL = "appWidgetDetail";

    /** 小米文档化的 extras 键：指定详情页里定位到哪个组件；不填则定位到第一个。 */
    public static final String KEY_WIDGET_NAME = "widgetName";

    /** {@link Sink} 是 `Bundle` 的最小投影，只暴露本类真正用到的两个写入方法。 */
    public interface Sink {
        void putString(String key, String value);

        void putInt(String key, int value);
    }

    /** 一次 pin 的 extras 计划：纯数据，没有任何 Android 类型。 */
    public static final class Plan {
        private final boolean widgetCenterDetail;
        private final String widgetName;
        private final int minWidthDp;
        private final int minHeightDp;

        Plan(boolean widgetCenterDetail, String widgetName, int minWidthDp, int minHeightDp) {
            this.widgetCenterDetail = widgetCenterDetail;
            this.widgetName = widgetName;
            this.minWidthDp = minWidthDp;
            this.minHeightDp = minHeightDp;
        }

        /** @return 是否要带小米的「打开详情页」那组 extras。 */
        public boolean isWidgetCenterDetail() {
            return widgetCenterDetail;
        }

        /** @return 形如 `包名/完整类名`；不带那组 extras 时返回空串。 */
        public String getWidgetName() {
            return widgetName;
        }

        public int getMinWidthDp() {
            return minWidthDp;
        }

        public int getMinHeightDp() {
            return minHeightDp;
        }
    }

    private WidgetPinExtras() {
    }

    /**
     * 决定这次 extras 的内容。
     *
     * <p>「要不要带小米那组」**不由这里判断**，而是转问
     * {@link WidgetVendorSupport#usesWidgetCenterExtrasFor}——厂商与版本门槛只有一个出处，这里只负责拼装。
     *
     * @param family 厂商族。
     * @param modern 是否「最新系统」（{@link WidgetVendorSupport#isModern} 的结论）。
     * @param detailPageSupported 小米官方探测接口的结论；非小米或探测失败传 false。
     * @param packageName 本应用包名。
     * @param providerClassName 该档 provider 的完整类名。
     * @param minWidthDp 目标格子宽（dp）。
     * @param minHeightDp 目标格子高（dp）。
     * @return 纯数据的计划。
     */
    public static Plan plan(WidgetVendorFamily family, boolean modern, boolean detailPageSupported,
            String packageName, String providerClassName, int minWidthDp, int minHeightDp) {
        boolean detail = WidgetVendorSupport.usesWidgetCenterExtrasFor(family, modern, detailPageSupported);
        return new Plan(detail, detail ? widgetName(packageName, providerClassName) : "",
                Math.max(0, minWidthDp), Math.max(0, minHeightDp));
    }

    /**
     * 把计划机械落到 sink 上。
     *
     * <p>顺序固定：先尺寸、后小米那组。顺序不是契约，但固定下来可以让「同样的输入产出同样的键顺序」，
     * 便于排查。
     */
    public static void apply(Plan plan, Sink sink) {
        if (plan == null || sink == null) {
            return;
        }
        sink.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, plan.getMinWidthDp());
        sink.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, plan.getMinHeightDp());
        if (plan.isWidgetCenterDetail()) {
            sink.putString(KEY_ADD_TYPE, ADD_TYPE_WIDGET_CENTER_DETAIL);
            sink.putString(KEY_WIDGET_NAME, plan.getWidgetName());
        }
    }

    /**
     * 小米 `widgetName` 的**唯一**拼装点：`包名/完整类名`（与官方示例
     * `"packageName/com.miui.ExampleWidgetProvider"` 同形）。
     *
     * <p>vivo 跳转的 `classname` 用的是同一个类名，但那边只取类名、不带包名 —— 取值来源是同一个
     * （provider 的完整类名），所以没有第二份拼装逻辑。
     */
    public static String widgetName(String packageName, String providerClassName) {
        String pkg = packageName == null ? "" : packageName;
        String cls = providerClassName == null ? "" : providerClassName;
        return pkg + "/" + cls;
    }
}
