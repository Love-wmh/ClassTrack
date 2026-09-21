package com.classtrack.app;

import java.util.List;

/**
 * 一次渲染里「字号用多大、行距留多少」的解。
 *
 * <p>产品口径（2026-09-20 真机比对后确定）：**格子越大，字号越大**。因此字号不是「填不满时的补偿」，
 * 而是**自变量**：由 {@link WidgetLayoutMetrics} 按真实格子尺寸给出上界，再由本类收一收：
 *
 * <ol>
 *   <li>先按格子尺寸得到字号上界 {@link WidgetLayoutMetrics#getScale()}；</li>
 *   <li>解出「内容刚好放下」的绝对字号系数（≤ 上界，下界 {@link #MIN_FONT_SCALE}）——这样既不会为了
 *       字号大而把字裁掉，也不会剩一大片空白；</li>
 *   <li>把零头（余量）分给行距与首尾留白，每份不超过 {@link #MAX_EXTRA_GAP_DP}：再大就变成「稀疏表格」，
 *       可扫读性反而下降。</li>
 * </ol>
 *
 * <p>为什么必须靠**解析式估算**而不是真实测量：Glance 拿不到文本测量结果（没有 `onTextLayout` 之类的
 * 回调），所以只能「行数 × 行盒高度」。行数是渲染前就已知的整数（来自 {@link WidgetBodyPlan}），
 * 行盒高度用实测标定系数（{@link WidgetLayoutMetrics#estimateLineHeightDp(float)}）。上一轮真机裁字的
 * 直接教训是：**估算只能用来分配余量，绝不能用来把内容压进固定高度**。
 *
 * <p>纯函数，可被 JUnit 直接覆盖（见 {@code WidgetFillPlanTest}）。
 */
public final class WidgetFillPlan {

    /** 字号系数的下界：内容实在太多时靠滚动，而不是把字缩到看不清。 */
    public static final float MIN_FONT_SCALE = 0.6f;

    /** 余量落到每份行距上的上限（dp）。 */
    public static final float MAX_EXTRA_GAP_DP = 8f;

    /** 估算时预留的安全余量比例（占总可用高度的 2%）。 */
    private static final float SAFETY_RATIO = 0.02f;

    /** 二分求解的迭代次数：20 次足以把系数收敛到 0.001 以内。 */
    private static final int SOLVE_ITERATIONS = 20;

    /**
     * 单字平均占位（相对字号）：中文一个字约 1 em，数字/拉丁字母约 0.55 em。
     *
     * <p>取 0.95 是**偏保守**的估计（对拉丁字母偏大 → 字号被收得更多一点），因为宁可字号小一点，
     * 也不能让课名在换行上限之外被截断 —— 那正是产品负责人明确否掉的表现。
     */
    private static final float AVERAGE_ADVANCE_EM = 0.95f;

    private final float fontScale;
    private final float localBoost;
    private final float gapDp;
    private final float firstGapDp;
    private final float fillRatio;
    private final int lineCount;

    private WidgetFillPlan(float fontScale, float metricsScale, float gapDp, float firstGapDp, float fillRatio,
            int lineCount) {
        this.lineCount = lineCount;
        this.fontScale = fontScale;
        this.localBoost = metricsScale <= 0f ? 1f : Math.min(1f, fontScale / metricsScale);
        this.gapDp = gapDp;
        this.firstGapDp = firstGapDp;
        this.fillRatio = fillRatio;
    }

    /**
     * 一段要渲染的文本：估算内容高度时既要字号，也要「它会折成几行」。
     *
     * <p>为什么必须带文字长度与可用宽度：字号变大 → 同一段课名折行数变多 → 内容更高。忽略折行会让估算
     * 偏小，于是字号被放到过大、课名被截成「毛泽东思想和中国…」。带上限的折行估算把这条堵死。
     */
    public static final class TextLine {
        private final float baseSp;
        private final int maxLines;
        private final int charCount;
        private final float widthDp;

        /**
         * @param baseSp 基准字号（未乘缩放）。
         * @param maxLines 这一段文字最多允许几行（与渲染层的 `maxLines` 一致）。
         * @param charCount 字符数。
         * @param widthDp 可用宽度（dp）。
         */
        public TextLine(float baseSp, int maxLines, int charCount, float widthDp) {
            this.baseSp = baseSp;
            this.maxLines = Math.max(1, maxLines);
            this.charCount = Math.max(1, charCount);
            this.widthDp = widthDp;
        }

        /** 在给定字号下折成几行（1..maxLines）。 */
        private int linesAt(float fontScale) {
            if (widthDp <= 0f) {
                return 1;
            }
            float textWidth = charCount * baseSp * fontScale * AVERAGE_ADVANCE_EM;
            int lines = (int) Math.ceil(textWidth / widthDp);
            return Math.min(Math.max(lines, 1), maxLines);
        }

        /**
         * 这一段在**不被截断**前提下允许的最大字号系数；宽度未知、或本来就允许省略号时（`maxLines == 1`）
         * 不设限 —— 列表里一行的课名放不下就省略号收尾是既有行为，不该因为名字长就把整张卡的字号拖小。
         */
        private float maxFontScaleWithoutTruncation() {
            if (widthDp <= 0f || baseSp <= 0f || maxLines <= 1) {
                return Float.MAX_VALUE;
            }
            return maxLines * widthDp / (charCount * baseSp * AVERAGE_ADVANCE_EM);
        }
    }

    /**
     * 求解一次渲染的填充方案。
     *
     * @param metrics 该格子尺寸下的度量（提供字号上界、基础行距与首尾留白）。
     * @param availableDp 该区域的可用高度（dp）；非正数时退化为「不分配余量」。
     * @param lineBaseSp 该区域**从上到下每一行文本的字号基准值**（未乘任何缩放的原始 sp）。
     *     hero 是纵向堆叠的三行，课程行是横向的一行；双行行项算两行 —— 调用方按真实排版顺序给。
     * @param allowFit 是否允许在尺寸字号之间再收一收（不可滚动的区域必须收；可滚动的列表可以放任溢出）。
     * @return 填充方案，永不为 `null`。
     */
    public static WidgetFillPlan compute(WidgetLayoutMetrics metrics, float availableDp, List<TextLine> lines,
            boolean allowFit) {
        float gapBase = metrics.getRowGapDp();
        float firstGapBase = metrics.getRowGapFirstDp();
        int lineCount = lines == null ? 0 : lines.size();
        if (lineCount == 0 || availableDp <= 0f) {
            return new WidgetFillPlan(metrics.getScale(), metrics.getScale(), gapBase, firstGapBase, 0f, lineCount);
        }

        // 上界：尺寸驱动的字号；允许拟合时再收一格 —— 不允许把**允许多行**的文字挤到被截断。
        float upper = Math.max(MIN_FONT_SCALE, metrics.getScale());
        if (allowFit) {
            for (TextLine line : lines) {
                upper = Math.min(upper, Math.max(MIN_FONT_SCALE, line.maxFontScaleWithoutTruncation()));
            }
        }
        float fontScale = upper;
        float budget = availableDp * (1f - SAFETY_RATIO);
        if (allowFit && heightAt(metrics, lines, upper, gapBase, firstGapBase) > budget) {
            float low = MIN_FONT_SCALE;
            float high = upper;
            for (int i = 0; i < SOLVE_ITERATIONS; i++) {
                float mid = (low + high) / 2f;
                if (heightAt(metrics, lines, mid, gapBase, firstGapBase) <= budget) {
                    low = mid;
                } else {
                    high = mid;
                }
            }
            fontScale = low;
        }

        float content = heightAt(metrics, lines, fontScale, gapBase, firstGapBase);
        float slack = availableDp - content;
        float share = clamp(slack / (lineCount + 1), 0f, MAX_EXTRA_GAP_DP);
        float gap = gapBase + share;
        float firstGap = firstGapBase + share / 2f;
        float filled = content + share * (lineCount + 1);
        return new WidgetFillPlan(fontScale, metrics.getScale(), gap, firstGap, filled / availableDp, lineCount);
    }

    /**
     * 估算内容总高。
     *
     * @param metrics 当前格子的度量。
     * @param lineBaseSp 每行文本的字号基准值。
     * @param fontScale 绝对字号系数（会再乘上度量自身的缩放）。
     * @param gap 行距。
     * @param firstGap 首行之前的留白。
     * @return 估算高度（dp）。
     */
    private static float heightAt(WidgetLayoutMetrics metrics, List<TextLine> lines, float fontScale,
            float gap, float firstGap) {
        float total = firstGap;
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) {
                total += gap;
            }
            TextLine line = lines.get(i);
            total += line.linesAt(fontScale)
                    * WidgetLayoutMetrics.estimateLineHeightDp(
                            WidgetLayoutMetrics.snappedSp(line.baseSp * fontScale));
        }
        return total;
    }

    private static float clamp(float value, float min, float max) {
        return Math.min(Math.max(value, min), max);
    }

    /** @return 本次渲染的**绝对**字号系数（已包含尺寸缩放），下界 {@link #MIN_FONT_SCALE}。 */
    public float getFontScale() {
        return fontScale;
    }

    /**
     * @return 相对度量自身缩放的局部系数（≤ 1）——渲染层把它乘到 `metrics.getXxxSp()` 上即可，
     *     不需要自己再除一次 {@link WidgetLayoutMetrics#getScale()}。
     */
    public float getLocalBoost() {
        return localBoost;
    }

    /** @return 行距（dp）。 */
    public float getGapDp() {
        return gapDp;
    }

    /** @return 首行之前与末行之后的留白（dp）。 */
    public float getFirstGapDp() {
        return firstGapDp;
    }

    /** @return 参与估算的文本行数（诊断用：同样的填充率、行数不同说明喂进去的内容不同）。 */
    public int getLineCount() {
        return lineCount;
    }

    /** @return 内容（含分配后的余量）占可用高度的比例；仅用于诊断与验收量测。 */
    public float getFillRatio() {
        return fillRatio;
    }
}
