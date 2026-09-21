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

    /** 「紧凑」样式下 hero 课名的行数：一行（这一条同时保证了 2×2 逐像素不变）。 */
    private static final int COMPACT_TITLE_LINES = 1;

    /** 其余样式下 hero 课名的行数：两行 —— 字号随格子变大了，一行放不下长课名。 */
    private static final int WIDE_TITLE_LINES = 2;

    /**
     * 按样式与配置算出正文的行序列。
     *
     * @param config 该实例的配置（布局样式 + 已上完策略 + 大格子表现）。
     * @param plan 「列今天还是列明天」的裁决结果。
     * @param dualColumn 这一次是否真的分了两栏（几何判据在 {@code WidgetLayoutMetrics} 里）。
     *     双栏的右栏更宽也更高，因此启用一组**静态富内容**（双行行项、汇总计数、左卡中缝、底部最后一节）。
     *     这些行只依赖渲染时刻已有的数据，不需要任何额外刷新。
     * @return 行序列与双栏切分点，永不为 `null`。
     */
    public static WidgetBodyPlan resolve(WidgetStyleConfig config, WidgetDayPlan plan, boolean dualColumn) {
        WidgetStyleConfig.LayoutStyle style = config.getLayoutStyle();
        boolean dense = isDense(config);

        if (style == WidgetStyleConfig.LayoutStyle.COMPACT) {
            // 「紧凑」= 一节主课 + 一行计数 + **主课之后的课**（2026-09-21 用户要求：1×2 下方原来是一整块空白）。
            //
            // 为什么是「主课之后」：主课就是 hero，再把它之后要上的课列出来，既补满了竖长格子的下半部分，
            // 又不会把同一节课说两遍。也因此**已完成的行永远不会出现在紧凑样式里** ——
            // 「今天已上完的课」这个选项对它始终无效果，与配置页那句灰显说明同源。
            List<WidgetBodyLine> compact = new ArrayList<>(3);
            // hero 明细拆两行（时间 / 教室）：紧凑只出现在窄格里，一行写「14:00 - 15:35 · C305」必然被裁，
            // 裁掉的正好是教室 —— 而教室是「这节课在哪上」的唯一线索，不能省。
            compact.add(WidgetBodyLine.hero(COMPACT_TITLE_LINES, true));
            compact.add(WidgetBodyLine.counter());
            List<WidgetDayItem> rows = plan.getRows();
            int afterHero = firstRowAfterHero(rows);
            for (int index = afterHero; index < rows.size(); index++) {
                // 下标在**本样式自己**的行序列里从 0 起：首行仍然多留一点与计数行之间的间距。
                compact.add(WidgetBodyLine.course(rows.get(index), index - afterHero, false));
            }
            // 课程行用窄卡形态（课名一行、「时间 · 教室」一行）：1×2 的格宽只有 82~105dp，
            // 时间一旦独占一列，课名就只剩三十几 dp，四个字的课名会被裁成「线性代…」。
            return new WidgetBodyPlan(compact, 1, WidgetBodyPlan.RowForm.COMPACT);
        }

        List<WidgetBodyLine> lines = new ArrayList<>();
        if (style == WidgetStyleConfig.LayoutStyle.NEXT_UP) {
            lines.add(WidgetBodyLine.hero(WIDE_TITLE_LINES));
        }
        // 双栏：左卡中缝放「下一节 + 本周进度」，于是左卡里是「顶部块 / 中缝 / 底部块」三段。
        if (dualColumn) {
            lines.add(WidgetBodyLine.midNext());
        }

        if (plan.hasRows()) {
            lines.add(WidgetBodyLine.summary(dense));
            if (dualColumn) {
                lines.add(WidgetBodyLine.summaryCounts());
            }
            List<WidgetDayItem> rows = plan.getRows();
            for (int index = 0; index < rows.size(); index++) {
                lines.add(WidgetBodyLine.course(rows.get(index), index, dense));
            }
            if (dualColumn) {
                lines.add(WidgetBodyLine.footerLast());
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

        // 左栏恒为开头若干行：hero +（双栏时）中缝行；右栏是其余全部行。
        // 没有 hero 的样式（全天课表）左栏拿首行 —— 否则左栏会是空的，看起来像排坏了。
        int header = 0;
        for (WidgetBodyLine line : lines) {
            if (line.getKind() == WidgetBodyLine.Kind.HERO || line.getKind() == WidgetBodyLine.Kind.MID_NEXT) {
                header++;
            } else {
                break;
            }
        }
        if (header == 0) {
            header = lines.isEmpty() ? 0 : 1;
        }
        return new WidgetBodyPlan(lines, header);
    }

    /**
     * 「信息加密」是否生效。
     * {@link WidgetStyleConfig#isWideLayoutEffective()} 同源 —— 配置页也按同一判据灰显，两边不会打架。
     *
     * <p>判据与 {@link WidgetStyleConfig#isWideLayoutEffective()} 同源 —— 配置页也按同一判据灰显，两边不会打架。
     * <p>注意「紧凑」拿到的是「课程行增强不生效」而不是「没有课程行」：2026-09-21 起它的主课下方也列后续的课，
     * 但那些行恒为单行、也不补节次列 —— 那个样式要的就是一眼扫过去，加节次只会把窄格挤爆。
     *
     * @param config 该实例的配置。
     * @return 是否按「信息加密」的密度渲染。
     */
    /**
     * 行序列里「主课（hero）之后」的下标。
     *
     * <p>hero 与行序列的关系：正在上的那一行就是 hero；今天没有正在上的课时 hero 是第一节还没上的课。
     * 已完成的行排在它们之前，因此这个下标一定落在「还没上的课」的开头 —— 紧凑样式不会出现已上完的行。
     *
     * <p>全部行都已上完（今天已无课、hero 落到别的日子）时返回 `rows.size()`，即一行都不补。
     *
     * @param rows 当天的行序列。
     * @return 「主课之后」的第一个下标。
     */
    private static int firstRowAfterHero(List<WidgetDayItem> rows) {
        for (int index = 0; index < rows.size(); index++) {
            if (!rows.get(index).isFinished()) {
                return index + 1;
            }
        }
        return rows.size();
    }

    /**
     * 「信息加密」是否生效。
     *
     * <p>「紧凑」的主课下方也会列后续的课，但那些行恒为单行、也不补节次列，因此课程行增强对它仍然无效果；
     * 双栏更是与它无关。判据与 {@link WidgetStyleConfig#isWideLayoutEffective()} 同源 —— 配置页按同一判据灰显，
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
