package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * 填充求解器的安全性断言。
 *
 * <p>它守护的是**上一轮真机缺陷的根因**：用「字号 × 系数」估算内容高度时估算偏小，于是内容被压进一个
 * 放不下的高度里、hero 首行被裁掉。所以这里最核心的一条是
 * {@link #fontScaleAlwaysFitsInsideTheAvailableHeight()}。
 */
public class WidgetFillPlanTest {

    private static final float EPSILON = 0.01f;

    /** 一天的课表行序列（课程行为横向一行，双栏时算两行）。宽度给的是手机 4×3 的内容宽（339dp）。 */
    private static List<WidgetFillPlan.TextLine> lines(int courseRows, boolean twoLineRows) {
        return lines(courseRows, twoLineRows, 2, 339f);
    }

    private static List<WidgetFillPlan.TextLine> lines(int courseRows, boolean twoLineRows, int heroTitleLines,
            float widthDp) {
        java.util.ArrayList<WidgetFillPlan.TextLine> sp = new java.util.ArrayList<>();
        sp.add(new WidgetFillPlan.TextLine(11f, 1, 12, widthDp));       // 状态标签
        sp.add(new WidgetFillPlan.TextLine(16f, heroTitleLines, 24, widthDp));  // 课名
        sp.add(new WidgetFillPlan.TextLine(13f, 1, 22, widthDp));       // 时间 · 教室
        sp.add(new WidgetFillPlan.TextLine(11f, 1, 18, widthDp));       // 汇总行
        for (int i = 0; i < courseRows; i++) {
            sp.add(new WidgetFillPlan.TextLine(13f, twoLineRows ? 2 : 1, 30, widthDp));
            sp.add(new WidgetFillPlan.TextLine(11f, 1, 12, widthDp));
        }
        sp.add(new WidgetFillPlan.TextLine(11f, 2, 26, widthDp));       // 「今天最后一节」
        return sp;
    }

    private static float estimatedHeight(List<WidgetFillPlan.TextLine> lines, float fontScale, float gap,
            float firstGap) {
        // 与生产代码同构的估算（含折行）：测试自己算一遍，避免「用被测对象的输出验证被测对象」。
        float total = firstGap;
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) {
                total += gap;
            }
            total += wrappedLines(lines.get(i), fontScale)
                    * WidgetLayoutMetrics.estimateLineHeightDp(
                            WidgetLayoutMetrics.snappedSp(baseSp(lines.get(i)) * fontScale));
        }
        return total;
    }

    private static float baseSp(WidgetFillPlan.TextLine line) {
        try {
            java.lang.reflect.Field field = WidgetFillPlan.TextLine.class.getDeclaredField("baseSp");
            field.setAccessible(true);
            return field.getFloat(line);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(error);
        }
    }

    private static int wrappedLines(WidgetFillPlan.TextLine line, float fontScale) {
        try {
            java.lang.reflect.Method method = WidgetFillPlan.TextLine.class.getDeclaredMethod("linesAt", float.class);
            method.setAccessible(true);
            return (Integer) method.invoke(line, fontScale);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(error);
        }
    }

    /**
     * 核心断言：算出来的字号 + 行距，估算高度**不会超过**可用高度。
     *
     * <p>这正是「不裁切」的形式化版本：只要估算不超过可用高度，真机上就不会把内容压掉。
     */
    @Test
    public void fontScaleAlwaysFitsInsideTheAvailableHeight() {
        float[][] sizes = {{179f, 210f}, {373f, 321f}, {373f, 210f}, {733f, 419f}, {1142f, 419f}};
        for (float[] size : sizes) {
            WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(size[0], size[1]);
            float available = size[1] - 2 * metrics.getVerticalPaddingDp();
            for (boolean twoLine : new boolean[] {false, true}) {
                List<WidgetFillPlan.TextLine> sp = lines(4, twoLine);
                WidgetFillPlan plan = WidgetFillPlan.compute(metrics, available, sp, true);

                float height = estimatedHeight(sp, plan.getFontScale(), plan.getGapDp(), plan.getFirstGapDp());
                // 两种合法结果：① 收字号之后放得下；② 已经收到下限（0.6）仍然放不下 —— 此时靠滚动，
                // 而不是继续把字缩小到看不清。除此之外任何溢出都意味着「字号选大了、内容会被裁」。
                boolean fitsOrBottomedOut = height <= available + EPSILON
                        || Math.abs(plan.getFontScale() - WidgetFillPlan.MIN_FONT_SCALE) < EPSILON;
                assertTrue(size[0] + "×" + size[1] + "（双行=" + twoLine + "）估算高度不该超过可用高度：" + height
                        + " > " + available + "（字号 " + plan.getFontScale() + "）", fitsOrBottomedOut);
            }
        }
    }

    /** 字号上界就是尺寸给的那个（格子越大字号越大由 {@code WidgetLayoutMetrics} 决定，这里只许收不许放）。 */
    @Test
    public void fontScaleNeverExceedsTheSizeDrivenScale() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(733f, 419f);
        WidgetFillPlan plan = WidgetFillPlan.compute(metrics, 385f, lines(4, true), true);

        assertTrue(plan.getFontScale() <= metrics.getScale() + EPSILON);
        assertTrue("局部系数只负责收", plan.getLocalBoost() <= 1f + EPSILON);
        assertTrue("内容太多时也不能把字收到看不清", plan.getFontScale() >= WidgetFillPlan.MIN_FONT_SCALE);
    }

    /** 内容放得下时不该动字号：字号是尺寸的自变量，不是「填不满时的补偿」。 */
    @Test
    public void generousSpaceKeepsTheSizeDrivenFont() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(179f, 210f);
        WidgetFillPlan plan = WidgetFillPlan.compute(metrics, 600f, lines(1, false), true);

        assertEquals(metrics.getScale(), plan.getFontScale(), EPSILON);
    }

    /** 可滚动区域允许不收字号（内容溢出就滚，底部因此不会有留白）。 */
    @Test
    public void shrinkOnlyHappensWhenFitIsAllowed() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(733f, 419f);
        List<WidgetFillPlan.TextLine> sp = lines(6, true);

        assertEquals("不允许拟合时保持尺寸字号", metrics.getScale(),
                WidgetFillPlan.compute(metrics, 200f, sp, false).getFontScale(), EPSILON);
        assertTrue("允许拟合时会收到放得下",
                WidgetFillPlan.compute(metrics, 200f, sp, true).getFontScale() < metrics.getScale());
    }

    /** 余量落到每份间距上有上限：再大就不是「铺满」而是「稀疏表格」了。 */
    @Test
    public void gapExtraIsCapped() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(179f, 210f);
        WidgetFillPlan plan = WidgetFillPlan.compute(metrics, 2000f, lines(2, false), true);

        assertTrue(plan.getGapDp() <= metrics.getRowGapDp() + WidgetFillPlan.MAX_EXTRA_GAP_DP + EPSILON);
    }

    /** 退化输入（没有行 / 可用高度为 0 / 负数）不能让渲染崩掉或算出 0 号字。 */
    @Test
    public void degenerateInputsDegradeGracefully() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(373f, 321f);
        List<List<WidgetFillPlan.TextLine>> inputs =
                Arrays.asList(Collections.<WidgetFillPlan.TextLine>emptyList(), lines(1, false));
        for (List<WidgetFillPlan.TextLine> sp : inputs) {
            WidgetFillPlan plan = WidgetFillPlan.compute(metrics, 0f, sp, true);
            assertTrue(plan.getFontScale() > 0f);
            assertTrue(plan.getGapDp() >= 0f);
        }
        WidgetFillPlan nullLines = WidgetFillPlan.compute(metrics, 300f, null, true);
        assertTrue(nullLines.getFontScale() > 0f);
    }

    /** 填充率只用于诊断与验收量测，必须落在合理区间。 */
    @Test
    public void fillRatioStaysMeaningful() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(733f, 419f);
        WidgetFillPlan plan = WidgetFillPlan.compute(metrics, 385f, lines(4, true), true);

        assertTrue(plan.getFillRatio() > 0.5f && plan.getFillRatio() <= 1.05f);
    }
}
