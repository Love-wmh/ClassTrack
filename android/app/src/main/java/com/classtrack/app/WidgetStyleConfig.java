package com.classtrack.app;

import java.util.Locale;

/**
 * 每个 widget 实例的展示配置：布局样式 + 今天已上完的课怎么处理 + 大格子表现。
 *
 * <p>配置来自配置页写入的 Glance 状态，属于**外部输入**，因此解析必须容错：未知值、缺失值、
 * 大小写不一致都回退到默认值，绝不抛异常，也绝不因为配置损坏而让小工具变空白或显示错课。
 */
public final class WidgetStyleConfig {
    /** 主视图样式。 */
    public enum LayoutStyle {
        /** 全天课表：汇总行 + 今天一整天的课（正在上的高亮）。 */
        DAY_LIST,
        /** 接下来：hero 大卡片 + 今天的课表列表。 */
        NEXT_UP,
        /** 紧凑：只显示正在上 / 接下来的一节 + 「今天还有 N 节」。 */
        COMPACT
    }

    /** 今天已上完的课怎么处理。 */
    public enum FinishedPolicy {
        /** 保留但弱化显示。 */
        SHOW_DIM,
        /** 不显示。 */
        HIDE,
        /** 不占行，折叠成底部一行计数。 */
        COLLAPSE
    }

    /**
     * 「大格子表现」：格子变大时除了度量放大，还要不要额外给点东西。
     *
     * <p>设计取舍：这是**第三组实例级选项**而不是把「信息加密」做成布局样式的第四种，因为它与三种
     * 布局样式正交（「接下来 + 信息加密」与「全天课表 + 信息加密」都成立）。
     */
    public enum WideLayout {
        /** 跟随尺寸（默认）：只做度量放大，内容与改动前完全一致。 */
        ADAPTIVE,
        /** 信息加密：hero 课名放宽到 2 行、课程行补节次、汇总行补当天计数。 */
        DENSE,
        /** 双栏：格子足够宽时左栏放 hero、右栏放课表；不够宽时自动保持单栏。 */
        TWO_COLUMN
    }

    /** 存储键；与配置页写入的键保持一致。 */
    public static final String KEY_LAYOUT_STYLE = "layout_style";

    /** 存储键；与配置页写入的键保持一致。 */
    public static final String KEY_FINISHED_POLICY = "finished_policy";

    /**
     * 未配置过的实例使用「接下来」。
     *
     * <p>2026-09-20 由产品负责人从「全天课表」改成「接下来」：它同时给出 hero（现在上什么）与当天的课表，
     * 在放置时不多问一句也已经是信息量最大的默认值；想要纯列表的用户可以在配置页里改成「全天课表」。
     */
    public static final LayoutStyle DEFAULT_LAYOUT_STYLE = LayoutStyle.NEXT_UP;

    /** 未配置过的实例使用「已上完灰显」。 */
    public static final FinishedPolicy DEFAULT_FINISHED_POLICY = FinishedPolicy.SHOW_DIM;


    /** 存储键；与配置页写入的键保持一致。 */
    public static final String KEY_WIDE_LAYOUT = "wide_layout";

    /** 未配置过的实例使用「跟随尺寸」：本轮之前的行为就是这个。 */
    public static final WideLayout DEFAULT_WIDE_LAYOUT = WideLayout.ADAPTIVE;
    /** 仅有「紧凑」样式不显示列表，因此该策略对它无效果（配置页需如实标注）。 */
    public static final LayoutStyle STYLE_WITHOUT_LIST = LayoutStyle.COMPACT;

    private static final String VALUE_DAY_LIST = "day_list";
    private static final String VALUE_NEXT_UP = "next_up";
    private static final String VALUE_COMPACT = "compact";
    private static final String VALUE_SHOW_DIM = "show_dim";
    private static final String VALUE_HIDE = "hide";
    private static final String VALUE_COLLAPSE = "collapse";
    private static final String VALUE_ADAPTIVE = "adaptive";
    private static final String VALUE_DENSE = "dense";
    private static final String VALUE_TWO_COLUMN = "two_column";

    private final LayoutStyle layoutStyle;
    private final FinishedPolicy finishedPolicy;
    private final WideLayout wideLayout;

    /**
     * 两参数版本：第三个选项按默认「跟随尺寸」处理。保留它使既有调用点与测试不必改写。
     *
     * @param layoutStyle 布局样式，可为 `null`。
     * @param finishedPolicy 已上完策略，可为 `null`。
     */
    public WidgetStyleConfig(LayoutStyle layoutStyle, FinishedPolicy finishedPolicy) {
        this(layoutStyle, finishedPolicy, DEFAULT_WIDE_LAYOUT);
    }

    /**
     * @param layoutStyle 布局样式，可为 `null`。
     * @param finishedPolicy 已上完策略，可为 `null`。
     * @param wideLayout 大格子表现，可为 `null`。
     */
    public WidgetStyleConfig(LayoutStyle layoutStyle, FinishedPolicy finishedPolicy, WideLayout wideLayout) {
        this.layoutStyle = layoutStyle == null ? DEFAULT_LAYOUT_STYLE : layoutStyle;
        this.finishedPolicy = finishedPolicy == null ? DEFAULT_FINISHED_POLICY : finishedPolicy;
        this.wideLayout = wideLayout == null ? DEFAULT_WIDE_LAYOUT : wideLayout;
    }

    /** @return 默认配置（全天课表 + 已上完灰显）。 */
    public static WidgetStyleConfig defaults() {
        return new WidgetStyleConfig(DEFAULT_LAYOUT_STYLE, DEFAULT_FINISHED_POLICY);
    }

    /**
     * 从存储值解析配置。
     *
     * @param rawLayoutStyle 样式存储值，可为 `null` 或任意脏值。
     * @param rawFinishedPolicy 已上完策略存储值，可为 `null` 或任意脏值。
     * @return 配置；非法值一律回退到默认值，不抛异常。
     */
    public static WidgetStyleConfig parse(String rawLayoutStyle, String rawFinishedPolicy) {
        return new WidgetStyleConfig(parseLayoutStyle(rawLayoutStyle), parseFinishedPolicy(rawFinishedPolicy));
    }

    /**
     * 从三个存储值解析配置。
     *
     * @param rawLayoutStyle 样式存储值，可为 `null` 或任意脏值。
     * @param rawFinishedPolicy 已上完策略存储值，可为 `null` 或任意脏值。
     * @param rawWideLayout 大格子表现存储值，可为 `null` 或任意脏值。
     * @return 配置；非法值一律回退到默认值，不抛异常。
     */
    public static WidgetStyleConfig parse(String rawLayoutStyle, String rawFinishedPolicy, String rawWideLayout) {
        return new WidgetStyleConfig(parseLayoutStyle(rawLayoutStyle), parseFinishedPolicy(rawFinishedPolicy),
                parseWideLayout(rawWideLayout));
    }

    /**
     * 解析样式。
     *
     * @param raw 存储值。
     * @return 样式；非法值回退 {@link #DEFAULT_LAYOUT_STYLE}。
     */
    public static LayoutStyle parseLayoutStyle(String raw) {
        if (raw == null) return DEFAULT_LAYOUT_STYLE;
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (VALUE_DAY_LIST.equals(normalized)) return LayoutStyle.DAY_LIST;
        if (VALUE_NEXT_UP.equals(normalized)) return LayoutStyle.NEXT_UP;
        if (VALUE_COMPACT.equals(normalized)) return LayoutStyle.COMPACT;
        return DEFAULT_LAYOUT_STYLE;
    }

    /**
     * 解析「已上完的课」策略。
     *
     * @param raw 存储值。
     * @return 策略；非法值回退 {@link #DEFAULT_FINISHED_POLICY}。
     */
    public static FinishedPolicy parseFinishedPolicy(String raw) {
        if (raw == null) return DEFAULT_FINISHED_POLICY;
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (VALUE_SHOW_DIM.equals(normalized)) return FinishedPolicy.SHOW_DIM;
        if (VALUE_HIDE.equals(normalized)) return FinishedPolicy.HIDE;
        if (VALUE_COLLAPSE.equals(normalized)) return FinishedPolicy.COLLAPSE;
        return DEFAULT_FINISHED_POLICY;
    }

    /**
     * 解析「大格子表现」。
     *
     * @param raw 存储值。
     * @return 表现；非法值回退 {@link #DEFAULT_WIDE_LAYOUT}。
     */
    public static WideLayout parseWideLayout(String raw) {
        if (raw == null) return DEFAULT_WIDE_LAYOUT;
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (VALUE_DENSE.equals(normalized)) return WideLayout.DENSE;
        if (VALUE_TWO_COLUMN.equals(normalized)) return WideLayout.TWO_COLUMN;
        if (VALUE_ADAPTIVE.equals(normalized)) return WideLayout.ADAPTIVE;
        return DEFAULT_WIDE_LAYOUT;
    }

    /** @return 写回存储时使用的样式值。 */
    public String layoutStyleStorageValue() {
        if (layoutStyle == LayoutStyle.NEXT_UP) return VALUE_NEXT_UP;
        if (layoutStyle == LayoutStyle.COMPACT) return VALUE_COMPACT;
        return VALUE_DAY_LIST;
    }

    /** @return 写回存储时使用的策略值。 */
    public String finishedPolicyStorageValue() {
        if (finishedPolicy == FinishedPolicy.HIDE) return VALUE_HIDE;
        if (finishedPolicy == FinishedPolicy.COLLAPSE) return VALUE_COLLAPSE;
        return VALUE_SHOW_DIM;
    }

    /** @return 写回存储时使用的「大格子表现」值。 */
    public String wideLayoutStorageValue() {
        if (wideLayout == WideLayout.DENSE) return VALUE_DENSE;
        if (wideLayout == WideLayout.TWO_COLUMN) return VALUE_TWO_COLUMN;
        return VALUE_ADAPTIVE;
    }

    /** @return 「已上完的课」这个选项对当前样式是否有效。 */
    public boolean isFinishedPolicyEffective() {
        return layoutStyle != STYLE_WITHOUT_LIST;
    }

    public boolean isWideLayoutEffective() {
        return layoutStyle != STYLE_WITHOUT_LIST;
    }
    public LayoutStyle getLayoutStyle() {
        return layoutStyle;
    }

    public FinishedPolicy getFinishedPolicy() {
        return finishedPolicy;
    }

    public WideLayout getWideLayout() {
        return wideLayout;
    }
}
