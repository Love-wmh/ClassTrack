package com.classtrack.app;

import java.util.ArrayList;
import java.util.List;

/**
 * 把快照解析成「现在该显示什么」的纯函数。
 *
 * 这是本任务唯一需要精细推理的算法，因此刻意不依赖 Android 框架的任何东西：
 * 只有 `long` epoch 比较与列表遍历，可以被 JUnit 完全覆盖。
 *
 * 全程**不做日期或时区运算**：判定「今天是第几天」只用快照里的 `dayEndEpochMs`，
 * 显示用文案全部由 Web 侧预格式化，原生侧因此不需要 `java.time` 或 desugaring。
 */
public final class WidgetStateResolver {
    /**
     * 设备时钟回拨的容忍窗口。
     *
     * `now` 明显早于快照生成时刻时，说明设备时间被改过或时区被手动调整。此时继续用
     * 这个 `now` 选课会选出错误的课，因此按过期处理，交给 UI 提示用户重新同步。
     */
    static final long CLOCK_ROLLBACK_TOLERANCE_MS = 6L * 60L * 60L * 1000L;

    private WidgetStateResolver() {}

    /**
     * 解析渲染状态。
     *
     * @param snapshot 已解析的快照；`null` 表示从未推送过或解析失败。
     * @param nowEpochMs 当前时刻（epoch 毫秒），由调用方显式传入以便测试。
     * @return 渲染状态，永不为 `null`。
     */
    public static WidgetDisplayState resolve(WidgetSnapshot snapshot, long nowEpochMs) {
        if (snapshot == null) return WidgetDisplayState.missing();
        if (snapshot.getSchemaVersion() != WidgetSnapshot.SCHEMA_VERSION) return WidgetDisplayState.missing();

        WidgetSnapshot.Status status = snapshot.getStatus();
        if (status == WidgetSnapshot.Status.UNAVAILABLE) return WidgetDisplayState.unavailable();
        if (status == WidgetSnapshot.Status.EMPTY) return WidgetDisplayState.empty();

        if (nowEpochMs < snapshot.getGeneratedAtEpochMs() - CLOCK_ROLLBACK_TOLERANCE_MS) {
            return WidgetDisplayState.stale();
        }
        if (nowEpochMs > snapshot.getValidUntilEpochMs()) {
            return WidgetDisplayState.stale();
        }

        List<Long> dayEnds = snapshot.getDayEndEpochMs();
        int currentDayOffset = currentDayOffset(dayEnds, nowEpochMs);
        if (currentDayOffset < 0) {
            // 覆盖窗口里没有任何一天包含 now：快照已经不能安全解释，按过期处理。
            return WidgetDisplayState.stale();
        }

        List<WidgetOccurrence> entries = snapshot.getEntries();
        WidgetOccurrence hero = firstNotEnded(entries, nowEpochMs);
        if (hero == null) {
            // 快照本身有效，但里面已经没有未结束的课 —— 学期结束，而不是「没有课表」。
            return WidgetDisplayState.noUpcoming();
        }

        WidgetDisplayState.HeroState heroState;
        if (hero.getStartEpochMs() <= nowEpochMs) {
            heroState = WidgetDisplayState.HeroState.IN_PROGRESS;
        } else if (hero.getDayOffset() == currentDayOffset) {
            heroState = WidgetDisplayState.HeroState.UPCOMING;
        } else {
            heroState = WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY;
        }

        long currentDayEnd = dayEnds.get(currentDayOffset);
        Long boundary = nextBoundaryEpochMs(entries, hero, nowEpochMs, currentDayEnd);

        return WidgetDisplayState.ready(hero, todayRemaining(entries, hero, currentDayOffset, nowEpochMs), heroState,
                snapshot.getValidUntilEpochMs(), currentDayEnd, boundary);
    }

    /**
     * 找出「今天」在快照里的天数下标。
     *
     * @param dayEnds 下标即 `dayOffset`、值为该自然日本地 24:00 的列表。
     * @param nowEpochMs 当前时刻。
     * @return 第一个 `dayEnd > now` 的下标；不存在时返回 -1。
     */
    private static int currentDayOffset(List<Long> dayEnds, long nowEpochMs) {
        for (int index = 0; index < dayEnds.size(); index++) {
            Long dayEnd = dayEnds.get(index);
            if (dayEnd != null && dayEnd > nowEpochMs) return index;
        }
        return -1;
    }

    /**
     * 取第一条尚未结束的课程。
     *
     * 判据是 `endEpochMs > now` 而**不是** `startEpochMs > now`：正在上的课也必须被选为
     * hero，否则会出现「课已经开始了却显示今天没课」。这正是结构性保证的实现点。
     *
     * @param entries 按 `startEpochMs` 升序的快照条目。
     * @param nowEpochMs 当前时刻。
     * @return 第一条未结束的课程；没有则为 `null`。
     */
    private static WidgetOccurrence firstNotEnded(List<WidgetOccurrence> entries, long nowEpochMs) {
        for (WidgetOccurrence occurrence : entries) {
            if (occurrence.getEndEpochMs() > nowEpochMs) return occurrence;
        }
        return null;
    }

    /**
     * 取今日剩余课程。
     *
     * @param entries 快照条目。
     * @param hero 已选定的 hero。
     * @param currentDayOffset 今天的 `dayOffset`。
     * @param nowEpochMs 当前时刻。
     * @return 今天尚未开始、且不是 hero 的课程，保持原有时间顺序。
     */
    private static List<WidgetOccurrence> todayRemaining(List<WidgetOccurrence> entries, WidgetOccurrence hero,
            int currentDayOffset, long nowEpochMs) {
        List<WidgetOccurrence> remaining = new ArrayList<>();
        for (WidgetOccurrence occurrence : entries) {
            if (occurrence.getDayOffset() != currentDayOffset) continue;
            if (occurrence.getStartEpochMs() <= nowEpochMs) continue;
            if (occurrence.getId().equals(hero.getId())) continue;
            remaining.add(occurrence);
        }
        return remaining;
    }

    /**
     * 计算下一次需要重新渲染的时刻。
     *
     * 候选集合是 `{hero 开始, hero 结束, hero 之后第一节课的开始与结束, 当天 24:00}` 中大于
     * `now` 的最小值。当天 24:00 必然大于 `now`（否则 {@link #currentDayOffset} 会选到更后一天），
     * 因此一定会返回一个有效边界，调度器不需要处理「无边界」的分支。
     *
     * @param entries 快照条目。
     * @param hero 已选定的 hero。
     * @param nowEpochMs 当前时刻。
     * @param currentDayEndEpochMs 当前自然日的本地 24:00。
     * @return 下一个边界时刻。
     */
    private static Long nextBoundaryEpochMs(List<WidgetOccurrence> entries, WidgetOccurrence hero, long nowEpochMs,
            long currentDayEndEpochMs) {
        long best = currentDayEndEpochMs;

        if (hero.getStartEpochMs() > nowEpochMs && hero.getStartEpochMs() < best) {
            best = hero.getStartEpochMs();
        }
        if (hero.getEndEpochMs() > nowEpochMs && hero.getEndEpochMs() < best) {
            best = hero.getEndEpochMs();
        }

        for (WidgetOccurrence occurrence : entries) {
            if (occurrence.getStartEpochMs() <= hero.getStartEpochMs()) continue;
            if (occurrence.getStartEpochMs() > nowEpochMs && occurrence.getStartEpochMs() < best) {
                best = occurrence.getStartEpochMs();
            }
            if (occurrence.getEndEpochMs() > nowEpochMs && occurrence.getEndEpochMs() < best) {
                best = occurrence.getEndEpochMs();
            }
            break;
        }

        return best;
    }
}
