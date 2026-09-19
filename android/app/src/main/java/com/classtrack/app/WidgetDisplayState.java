package com.classtrack.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 小工具渲染所需的纯数据状态，不依赖 Android UI。
 *
 * 状态全部由 {@link WidgetStateResolver} 在给定 `now` 的瞬间算出，渲染层只读不判：
 * 这样「该显示哪节课」的逻辑可以完全用 JUnit 覆盖，不需要设备或模拟器。
 */
public final class WidgetDisplayState {
    public enum Type {
        /** 从未推送过快照。 */
        MISSING,
        /** 快照声明缺少学期开始日期，无法推算日历日期。 */
        UNAVAILABLE,
        /** 课表为空（未导入课程）。 */
        EMPTY,
        /** 快照已过期（设备时钟回拨或超过覆盖窗口）。 */
        STALE,
        /** 快照有效，但内部已不存在任何未结束的课程（学期已结束）。 */
        NO_UPCOMING,
        /** 有可展示的课程。 */
        READY
    }

    public enum HeroState {
        /** 正在进行：`start <= now < end`。 */
        IN_PROGRESS,
        /** 今天稍后开始。 */
        UPCOMING,
        /** 今天没有课了，下一节在后续日期。 */
        UPCOMING_OTHER_DAY
    }

    private final Type type;
    private final WidgetOccurrence hero;
    private final List<WidgetOccurrence> todayRemaining;
    private final HeroState heroState;
    private final long validUntilEpochMs;
    private final long currentDayEndEpochMs;
    private final Long nextBoundaryEpochMs;

    private WidgetDisplayState(Type type, WidgetOccurrence hero, List<WidgetOccurrence> todayRemaining,
            HeroState heroState, long validUntilEpochMs, long currentDayEndEpochMs, Long nextBoundaryEpochMs) {
        this.type = type;
        this.hero = hero;
        this.todayRemaining = Collections.unmodifiableList(new ArrayList<>(todayRemaining));
        this.heroState = heroState;
        this.validUntilEpochMs = validUntilEpochMs;
        this.currentDayEndEpochMs = currentDayEndEpochMs;
        this.nextBoundaryEpochMs = nextBoundaryEpochMs;
    }

    public static WidgetDisplayState missing() {
        return emptyState(Type.MISSING);
    }

    public static WidgetDisplayState unavailable() {
        return emptyState(Type.UNAVAILABLE);
    }

    public static WidgetDisplayState empty() {
        return emptyState(Type.EMPTY);
    }

    public static WidgetDisplayState stale() {
        return emptyState(Type.STALE);
    }

    public static WidgetDisplayState noUpcoming() {
        return emptyState(Type.NO_UPCOMING);
    }

    /**
     * 构造有内容可展示的状态。
     *
     * @param hero 当前或接下来的那一节课。
     * @param remaining 今日剩余（已排除 hero）。
     * @param heroState hero 的时间状态。
     * @param validUntilEpochMs 快照覆盖窗口的结束时刻。
     * @param currentDayEndEpochMs 当前自然日的本地 24:00。
     * @param nextBoundaryEpochMs 下一次需要重新渲染的时刻；为 `null` 表示无需排程。
     * @return 渲染状态。
     */
    public static WidgetDisplayState ready(WidgetOccurrence hero, List<WidgetOccurrence> remaining,
            HeroState heroState, long validUntilEpochMs, long currentDayEndEpochMs, Long nextBoundaryEpochMs) {
        return new WidgetDisplayState(Type.READY, hero, remaining, heroState, validUntilEpochMs,
                currentDayEndEpochMs, nextBoundaryEpochMs);
    }

    private static WidgetDisplayState emptyState(Type type) {
        return new WidgetDisplayState(type, null, Collections.emptyList(), null, Long.MIN_VALUE, Long.MIN_VALUE, null);
    }

    public Type getType() {
        return type;
    }

    public boolean isReady() {
        return type == Type.READY;
    }

    public WidgetOccurrence getHero() {
        return hero;
    }

    public List<WidgetOccurrence> getTodayRemaining() {
        return todayRemaining;
    }

    public HeroState getHeroState() {
        return heroState;
    }

    public long getValidUntilEpochMs() {
        return validUntilEpochMs;
    }

    public long getCurrentDayEndEpochMs() {
        return currentDayEndEpochMs;
    }

    /** @return 下一次需要重新渲染的时刻；`null` 表示不需要排程。 */
    public Long getNextBoundaryEpochMs() {
        return nextBoundaryEpochMs;
    }
}
