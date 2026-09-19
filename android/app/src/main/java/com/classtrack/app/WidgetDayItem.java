package com.classtrack.app;

/**
 * 今日课表里的一行：一节课 + 它在 `now` 这一刻所处的阶段。
 *
 * <p>阶段由 {@link WidgetStateResolver} 在解析时按 `now` 标好，因此渲染层不需要做任何时间比较 ——
 * 这是「渲染层只读不判」这条分工原则在「全天课表」样式下的延续。
 */
public final class WidgetDayItem {
    /** 一行课程相对当前时刻的阶段。 */
    public enum Phase {
        /** 已上完：`end <= now`。 */
        FINISHED,
        /** 正在上：`start <= now < end`。 */
        IN_PROGRESS,
        /** 还没开始：`start > now`。 */
        UPCOMING
    }

    private final WidgetOccurrence occurrence;
    private final Phase phase;

    public WidgetDayItem(WidgetOccurrence occurrence, Phase phase) {
        this.occurrence = occurrence;
        this.phase = phase;
    }

    public WidgetOccurrence getOccurrence() {
        return occurrence;
    }

    public Phase getPhase() {
        return phase;
    }

    /** @return 该行是否已经上完。 */
    public boolean isFinished() {
        return phase == Phase.FINISHED;
    }

    /** @return 该行是否正在上。 */
    public boolean isInProgress() {
        return phase == Phase.IN_PROGRESS;
    }
}
