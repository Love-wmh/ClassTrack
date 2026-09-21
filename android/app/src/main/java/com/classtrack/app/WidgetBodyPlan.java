package com.classtrack.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 一次渲染要画的完整正文：行的序列 + 双栏时的切分点。
 *
 * @see WidgetLinePolicy
 */
public final class WidgetBodyPlan {

    /**
     * 课程行的形态。
     *
     * <p>三种形态装的是同一份数据（课名、时间、教室），差别只在窄格里怎么摆：
     *
     * <ul>
     *   <li>{@link #STANDARD}：时间单独成列 + 课名 + 教室靠右。手机宽格与平板用的就是它。</li>
     *   <li>{@link #TWO_LINE}：时间列 + 课名，教室挪到课名下面。双栏右栏用（700dp 宽的卡片把教室推到
     *       最右边，眼睛要从课名跳到屏幕另一头）。</li>
     *   <li>{@link #COMPACT}：课名一行、「时间 · 教室」一行。1×2 这种 82~105dp 的窄格里，时间列
     *       一旦独占一列，课名就只剩三十几 dp（四个字的课名会被裁成「线性代…」）。</li>
     * </ul>
     */
    public enum RowForm {
        STANDARD,
        TWO_LINE,
        COMPACT
    }

    private final List<WidgetBodyLine> lines;
    private final int headerLineCount;
    private final RowForm rowForm;

    /**
     * @param lines 行序列；`null` 按空序列处理。
     * @param headerLineCount 双栏时归入左栏的行数。
     */
    public WidgetBodyPlan(List<WidgetBodyLine> lines, int headerLineCount) {
        this(lines, headerLineCount, RowForm.STANDARD);
    }

    /**
     * @param lines 行序列；`null` 按空序列处理。
     * @param headerLineCount 双栏时归入左栏的行数。
     * @param rowForm 课程行的形态。
     */
    public WidgetBodyPlan(List<WidgetBodyLine> lines, int headerLineCount, RowForm rowForm) {
        List<WidgetBodyLine> copy = lines == null ? new ArrayList<>() : new ArrayList<>(lines);
        this.lines = Collections.unmodifiableList(copy);
        this.headerLineCount = Math.min(Math.max(headerLineCount, 0), this.lines.size());
        this.rowForm = rowForm == null ? RowForm.STANDARD : rowForm;
    }


    /** @return 行序列，不可修改。 */
    public List<WidgetBodyLine> getLines() {
        return lines;
    }

    /**
     * @return 双栏布局时左栏应当接收的行数（右栏是其余全部行）。单栏渲染忽略它。
     *     取值恒为 0（没有任何行）或 1（左栏放首行 —— 有 hero 时是 hero，没有 hero 时是汇总行）。
     */
    public int getHeaderLineCount() {
        return headerLineCount;
    }

    /** @return 课程行的形态；永不为 `null`。 */
    public RowForm getRowForm() {
        return rowForm;
    }

    /** @return 行序列是否为空。 */
    public boolean isEmpty() {
        return lines.isEmpty();
    }
}
