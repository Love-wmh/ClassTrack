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
        /**
         * 自动（按尺寸）：**历史口径**留下的状态（2026-09-21 起不再是默认值，也不再出现在配置页）。
         * （见 {@link WidgetStyleResolver}：解析成该实例 provider 预设的样式）。
         *
         * <p>为什么保留而不删掉：历史实例存过 `"auto"`，而配置页已不再提供这一档 —— 保留它才能让那些
         * 存储值继续解析出一个可渲染的配置，而不是落进「未知值 → 默认」的分支。
         */
        AUTO,
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
     * <p>2026-09-21 口径变更（维护面收缩）：默认值从「自动（按尺寸）」改回「接下来」。
     * 原因是「按尺寸自动匹配样式」那条路径被删除（见 design D3）—— 现在样式由用户显式选择、
     * 或该实例 provider 那档预设的样式决定，尺寸只影响度量。
     *
     * <p>`AUTO` 仍然可解析（历史实例存过 `"auto"`），只是不再作为默认值，也不再出现在配置页 UI 上；
     * 它读出来会被 {@link WidgetStyleResolver} 解析成 provider 预设的样式。
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

    private static final String VALUE_AUTO = "auto";

    /**
     * 「未显式选择」的**存储值**（`"auto"`），公开给读取方用。
     *
     *     <p>为什么要暴露它：`WidgetStyleState.read` 需要区分「这个键从没被写过」与「用户选了某个样式」。
     *     前者应当回落到该实例 provider 那档预设的样式（1×2 → 紧凑），后者原样生效 —— 而 `parse(null, ...)`
     *     会把「没写过」直接变成 {@link #DEFAULT_LAYOUT_STYLE}，那样 provider 预设就永远生效不了。
     */
    public static final String STORAGE_VALUE_AUTO = VALUE_AUTO;
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
        if (VALUE_AUTO.equals(normalized)) return LayoutStyle.AUTO;
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
        if (layoutStyle == LayoutStyle.AUTO) return VALUE_AUTO;
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
        // 「紧凑」不显示列表，宽格表现对它天然无效。
        // 注意：「自动（按尺寸）」已不再是默认值、也不再出现在 UI 上，但历史实例仍可能存着 `auto`，
        // 那种情况下宽格表现由解析出的 provider 预设决定 —— 同样算「不生效」，配置页会灰显并说明。
        return layoutStyle != STYLE_WITHOUT_LIST && layoutStyle != LayoutStyle.AUTO;
    }

    /**
     * 这份配置是否需要「更多设置」二级区来承载。
     *
     * <p>配置页一级只留「接下来」（核心档），其余样式与两组选项收进默认折叠的二级区；
     * 但**默认折叠不能让已有配置看起来丢了** —— 只要实例的配置落在二级区里，进页面就要自动展开。
     *
     * @return 样式不是「接下来」，或「已上完」「大格子表现」不是默认值时返回 `true`。
     */
    public boolean needsAdvancedSection() {
        return layoutStyle != LayoutStyle.NEXT_UP
                || finishedPolicy != DEFAULT_FINISHED_POLICY
                || wideLayout != DEFAULT_WIDE_LAYOUT;
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
