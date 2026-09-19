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
    private final List<WidgetDayItem> todayItems;
    private final List<WidgetDayItem> nextDayItems;
    private final int todayRemainingCount;
    private final int todayFinishedCount;
    private final HeroState heroState;
    private final long validUntilEpochMs;
    private final long currentDayEndEpochMs;
    private final Long nextBoundaryEpochMs;

    private WidgetDisplayState(Type type, WidgetOccurrence hero, List<WidgetDayItem> todayItems,
            List<WidgetDayItem> nextDayItems,
            HeroState heroState, long validUntilEpochMs, long currentDayEndEpochMs, Long nextBoundaryEpochMs) {
        this.type = type;
        this.hero = hero;
        this.todayItems = Collections.unmodifiableList(new ArrayList<>(todayItems));
        this.nextDayItems = Collections.unmodifiableList(new ArrayList<>(nextDayItems));
        this.heroState = heroState;
        this.validUntilEpochMs = validUntilEpochMs;
        this.currentDayEndEpochMs = currentDayEndEpochMs;
        this.nextBoundaryEpochMs = nextBoundaryEpochMs;

        // 两个计数在这里一次算好：让「今天还有几节」「已上完几节」只有一处事实来源，
        // 避免渲染层各自重算导致文案与列表不一致。
        int finished = 0;
        int upcomingAfterHero = 0;
        for (WidgetDayItem item : todayItems) {
            if (item.isFinished()) {
                finished++;
            } else if (item.getPhase() == WidgetDayItem.Phase.UPCOMING && !isHero(hero, item)) {
                upcomingAfterHero++;
            }
        }
        this.todayFinishedCount = finished;
        this.todayRemainingCount = upcomingAfterHero;
    }

    /**
     * 判断某一行是否就是 hero 本身。
     *
     * 按 `id` 比较而不是按引用：hero 与今日行来自同一次解析，但渲染层会把它们当作两个视图使用，
     * 用稳定 id 比较可以避免任何复制导致的身份漂移。
     *
     * @param hero 已选定的 hero，可为 `null`。
     * @param item 今日课表的一行。
     * @return 该行是否就是 hero。
     */
    private static boolean isHero(WidgetOccurrence hero, WidgetDayItem item) {
        return hero != null && hero.getId().equals(item.getOccurrence().getId());
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
     * @param todayItems 今天一整天的课（含已上完），阶段已由解析器按 `now` 标好。
     * @param nextDayItems 明天的课；用于「今天没课、明天有课」时把格子填满，阶段同样已标好。
     * @param heroState hero 的时间状态。
     * @param validUntilEpochMs 快照覆盖窗口的结束时刻。
     * @param currentDayEndEpochMs 当前自然日的本地 24:00。
     * @param nextBoundaryEpochMs 下一次需要重新渲染的时刻；为 `null` 表示无需排程。
     * @return 渲染状态。
     */
    public static WidgetDisplayState ready(WidgetOccurrence hero, List<WidgetDayItem> todayItems,
            List<WidgetDayItem> nextDayItems,
            HeroState heroState, long validUntilEpochMs, long currentDayEndEpochMs, Long nextBoundaryEpochMs) {
        return new WidgetDisplayState(Type.READY, hero, todayItems, nextDayItems, heroState, validUntilEpochMs,
                currentDayEndEpochMs, nextBoundaryEpochMs);
    }

    private static WidgetDisplayState emptyState(Type type) {
        return new WidgetDisplayState(type, null, Collections.emptyList(), Collections.emptyList(), null,
                Long.MIN_VALUE, Long.MIN_VALUE, null);
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

    /** @return 今天一整天的课（含已上完）；非 `READY` 状态为空列表。 */
    public List<WidgetDayItem> getTodayItems() {
        return todayItems;
    }

    /**
     * @return 明天的课；用于「今天没课、明天有课」时把格子填满。非 `READY`、明天没课、
     *     或明天已在快照覆盖窗口之外时为空列表。
     */
    public List<WidgetDayItem> getNextDayItems() {
        return nextDayItems;
    }

    /** @return 今天尚未开始、且不是 hero 本身的节数（紧凑样式显示「今天还有 N 节」）。 */
    public int getTodayRemainingCount() {
        return todayRemainingCount;
    }

    /** @return 今天已上完的节数（折叠策略显示「已上完 N 节」）。 */
    public int getTodayFinishedCount() {
        return todayFinishedCount;
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
