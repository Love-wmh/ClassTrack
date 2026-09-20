package com.classtrack.app;

import java.util.ArrayList;
import java.util.List;

/**
 * 「这一次要画哪些行、每行要不要多给一点信息」的唯一判决处。
 *
 * <p>它前身是 {@code ClassTrackWidget.kt} 里的私有 `bodyLines(...)`：纯逻辑、不碰 Android，却完全在
 * JVM 测试之外。搬到这里之后，三种样式 × 三种「已上完」策略的既有行为由
 * {@code WidgetLinePolicyTest} 逐项钉住，新加的「信息加密」也一并可测。
 *
 * <p>渲染层从此只画判决结果，不再自己决定显示什么 —— 与 {@link WidgetDayPlan}（决定列今天还是明天）
 * 的分工一致。
 *
 * <p>「双栏」的切分点也在这里：左栏恒为**首行**（有 hero 时就是 hero，没有 hero 时是汇总行），
 * 右栏是其余全部行，因此分栏既不会漏内容，也不会把课程行留在左栏。
 *
 * <p>纯函数：不读时间、不碰 Android。
 */
public final class WidgetLinePolicy {

    private WidgetLinePolicy() {
    }

    /**
     * 按样式与配置算出正文的行序列。
     *
     * @param config 该实例的配置（布局样式 + 已上完策略 + 大格子表现）。
     * @param plan 「列今天还是列明天」的裁决结果。
     * @return 行序列与双栏切分点，永不为 `null`。
     */
    public static WidgetBodyPlan resolve(WidgetStyleConfig config, WidgetDayPlan plan) {
        WidgetStyleConfig.LayoutStyle style = config.getLayoutStyle();
        boolean dense = isDense(config);

        if (style == WidgetStyleConfig.LayoutStyle.COMPACT) {
            // 「紧凑」定位就是只显示一节课，不因为格子变大而长出列表。
            List<WidgetBodyLine> compact = new ArrayList<>(2);
            compact.add(WidgetBodyLine.hero(dense ? 2 : 1));
            compact.add(WidgetBodyLine.counter());
            return new WidgetBodyPlan(compact, 1);
        }

        List<WidgetBodyLine> lines = new ArrayList<>();
        if (style == WidgetStyleConfig.LayoutStyle.NEXT_UP) {
            lines.add(WidgetBodyLine.hero(dense ? 2 : 1));
        }

        if (plan.hasRows()) {
            lines.add(WidgetBodyLine.summary(dense));
            List<WidgetDayItem> rows = plan.getRows();
            for (int index = 0; index < rows.size(); index++) {
                lines.add(WidgetBodyLine.course(rows.get(index), index, dense));
            }
            if (plan.getCollapsedFinishedCount() > 0) {
                lines.add(WidgetBodyLine.collapsed());
            }
            // 已经在列明天的课了，再补一行「下一节是明天 …」就是把同一节课说两遍。
            if (style == WidgetStyleConfig.LayoutStyle.DAY_LIST
                    && plan.getSource() != WidgetDayPlan.Source.TOMORROW) {
                lines.add(WidgetBodyLine.nextOther());
            }
        } else {
            // 没有课程行时，汇总行自己就是「今天无课 / 今天已无课」；紧凑样式由计数行表达同一件事。
            if (style == WidgetStyleConfig.LayoutStyle.DAY_LIST) {
                lines.add(WidgetBodyLine.summary(dense));
            }
            if (plan.getCollapsedFinishedCount() > 0) {
                lines.add(WidgetBodyLine.collapsed());
            }
            lines.add(WidgetBodyLine.nextOther());
        }

        return new WidgetBodyPlan(lines, lines.isEmpty() ? 0 : 1);
    }

    /**
     * 「信息加密」是否生效。
     *
     * <p>「紧凑」样式不显示课表，课程行增强与双栏对它都无意义，因此它与
     * {@link WidgetStyleConfig#isWideLayoutEffective()} 同源 —— 配置页也按同一判据灰显，
     * 两边不会打架。
     *
     * @param config 该实例的配置。
     * @return 是否按「信息加密」的密度渲染。
     */
    private static boolean isDense(WidgetStyleConfig config) {
        return config.isWideLayoutEffective()
                && config.getWideLayout() == WidgetStyleConfig.WideLayout.DENSE;
    }
}
