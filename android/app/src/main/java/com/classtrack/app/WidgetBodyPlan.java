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

    private final List<WidgetBodyLine> lines;
    private final int headerLineCount;

    /**
     * @param lines 行序列；`null` 按空序列处理。
     * @param headerLineCount 双栏时归入左栏的行数。
     */
    public WidgetBodyPlan(List<WidgetBodyLine> lines, int headerLineCount) {
        List<WidgetBodyLine> copy = lines == null ? new ArrayList<>() : new ArrayList<>(lines);
        this.lines = Collections.unmodifiableList(copy);
        this.headerLineCount = Math.min(Math.max(headerLineCount, 0), this.lines.size());
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

    /** @return 行序列是否为空。 */
    public boolean isEmpty() {
        return lines.isEmpty();
    }
}
