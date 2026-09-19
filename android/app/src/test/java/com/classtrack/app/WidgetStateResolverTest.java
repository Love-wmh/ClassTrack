package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * {@link WidgetStateResolver} 的纯逻辑测试。
 *
 * 所有 `nowEpochMs` 都显式传入且用 epoch 常量表达，因此用例既不依赖
 * `System.currentTimeMillis()`，也不受运行机器时区影响（UTC 与 UTC+8 结果一致）。
 *
 * 断言里刻意不出现任何日历概念：resolver 只比较 epoch，这正是「原生不做日期运算」的验证方式。
 */
public class WidgetStateResolverTest {
    private static final long HOUR_MS = 3_600_000L;
    private static final long DAY_MS = 24L * HOUR_MS;

    /** 快照生成时刻。具体日历值无关紧要。 */
    private static final long GENERATED_AT = 1_700_000_000_000L;

    /** 生成当天（dayOffset 0）的本地 24:00。 */
    private static final long DAY0_END = GENERATED_AT + 15 * HOUR_MS;
    private static final long DAY1_END = DAY0_END + DAY_MS;
    private static final long DAY2_END = DAY1_END + DAY_MS;

    /** 生成当天 12:00 左右，位于 dayOffset 0 之内。 */
    private static final long NOW_DAY0 = GENERATED_AT + 3 * HOUR_MS;

    private static final long VALID_UNTIL = DAY2_END;

    private static final long[] DAYS_1 = { DAY0_END };
    private static final long[] DAYS_2 = { DAY0_END, DAY1_END };
    private static final long[] DAYS_3 = { DAY0_END, DAY1_END, DAY2_END };

    @Test
    public void missingWhenSnapshotIsAbsent() {
        assertEquals(WidgetDisplayState.Type.MISSING, WidgetStateResolver.resolve(null, NOW_DAY0).getType());
    }

    @Test
    public void missingWhenSchemaVersionDoesNotMatch() {
        WidgetSnapshot snapshot = scheduleWithSchemaVersion(2, VALID_UNTIL, DAYS_1);

        assertEquals(WidgetDisplayState.Type.MISSING, WidgetStateResolver.resolve(snapshot, NOW_DAY0).getType());
    }

    @Test
    public void unavailableAndEmptyStayDistinct() {
        WidgetDisplayState unavailable = WidgetStateResolver.resolve(standalone(WidgetSnapshot.Status.UNAVAILABLE), NOW_DAY0);
        WidgetDisplayState empty = WidgetStateResolver.resolve(standalone(WidgetSnapshot.Status.EMPTY), NOW_DAY0);

        assertEquals(WidgetDisplayState.Type.UNAVAILABLE, unavailable.getType());
        assertEquals(WidgetDisplayState.Type.EMPTY, empty.getType());
        assertFalse(unavailable.isReady());
        assertNull(unavailable.getHero());
    }

    @Test
    public void staleWhenNowIsPastTheCoverageWindow() {
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_3);

        assertEquals(WidgetDisplayState.Type.STALE, WidgetStateResolver.resolve(snapshot, DAY2_END + 1).getType());
    }

    @Test
    public void staleWhenDeviceClockRolledBackBeyondTolerance() {
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1, occurrence("LIVE", GENERATED_AT - HOUR_MS, GENERATED_AT + HOUR_MS, 0));

        assertEquals(WidgetDisplayState.Type.STALE, WidgetStateResolver.resolve(snapshot, GENERATED_AT - 7 * HOUR_MS).getType());
        // 容差之内的轻微偏差仍按正常处理，不误报过期。
        assertEquals(WidgetDisplayState.Type.READY, WidgetStateResolver.resolve(snapshot, GENERATED_AT - HOUR_MS).getType());
    }

    @Test
    public void staleWhenNoDayContainsNow() {
        // 负载自相矛盾：validUntil 还在未来，但没有任何一天的结束时刻晚于 now。
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1);

        assertEquals(WidgetDisplayState.Type.STALE, WidgetStateResolver.resolve(snapshot, DAY1_END).getType());
    }

    /**
     * prd C11：课已开始但未结束时，它仍然是 hero 且状态为「正在进行」。
     *
     * 这是「要上课了却显示不上课」这类缺陷的结构性防线：hero 的判据是 `end > now`，
     * 而不是 `start > now`。
     */
    @Test
    public void inProgressClassIsStillTheHero() {
        long start = NOW_DAY0 - HOUR_MS;
        long end = NOW_DAY0 + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1, occurrence("MATH", start, end, 0));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertTrue(state.isReady());
        assertEquals("MATH", state.getHero().getId());
        assertEquals(WidgetDisplayState.HeroState.IN_PROGRESS, state.getHeroState());
        assertTrue(state.getTodayRemaining().isEmpty());
    }

    @Test
    public void upcomingClassTodayIsHeroWithUpcomingState() {
        long start = NOW_DAY0 + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1, occurrence("MATH", start, start + HOUR_MS, 0));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertEquals("MATH", state.getHero().getId());
        assertEquals(WidgetDisplayState.HeroState.UPCOMING, state.getHeroState());
    }

    @Test
    public void heroFallsBackToAnotherDayWhenTodayHasNoMoreClasses() {
        long earlierStart = NOW_DAY0 - 3 * HOUR_MS;
        long tomorrowStart = DAY1_END + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_2,
                occurrence("DONE", earlierStart, earlierStart + HOUR_MS, 0),
                occurrence("TOMORROW", tomorrowStart, tomorrowStart + HOUR_MS, 1));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertEquals("TOMORROW", state.getHero().getId());
        assertEquals(WidgetDisplayState.HeroState.UPCOMING_OTHER_DAY, state.getHeroState());
        assertTrue(state.getTodayRemaining().isEmpty());
    }

    @Test
    public void todayRemainingExcludesEndedInProgressAndHeroItself() {
        long endedStart = NOW_DAY0 - 3 * HOUR_MS;
        long liveStart = NOW_DAY0 - HOUR_MS;
        long futureStart = NOW_DAY0 + HOUR_MS;
        long otherDayStart = DAY1_END + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_2,
                occurrence("ENDED", endedStart, endedStart + HOUR_MS, 0),
                occurrence("LIVE", liveStart, liveStart + 2 * HOUR_MS, 0),
                occurrence("LATER", futureStart, futureStart + HOUR_MS, 0),
                occurrence("OTHER_DAY", otherDayStart, otherDayStart + HOUR_MS, 1));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertEquals("LIVE", state.getHero().getId());
        assertEquals(1, state.getTodayRemaining().size());
        assertEquals("LATER", state.getTodayRemaining().get(0).getId());
    }

    /**
     * 快照有效但里面已经没有未结束的课时，必须区分于「课表为空」：
     * 前者是本学期已结束，后者是还没导入课程，UI 文案不同。
     */
    @Test
    public void noUpcomingIsDistinctFromEmpty() {
        long endedStart = NOW_DAY0 - 3 * HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1, occurrence("ENDED", endedStart, endedStart + HOUR_MS, 0));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertEquals(WidgetDisplayState.Type.NO_UPCOMING, state.getType());
        assertNull(state.getHero());
    }

    @Test
    public void boundaryIsTheNearestFutureEventAmongClassEdgesAndDayEnd() {
        long liveEnd = NOW_DAY0 + HOUR_MS;
        long laterStart = NOW_DAY0 + 3 * HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1,
                occurrence("LIVE", NOW_DAY0 - HOUR_MS, liveEnd, 0),
                occurrence("LATER", laterStart, laterStart + HOUR_MS, 0));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertEquals(Long.valueOf(liveEnd), state.getNextBoundaryEpochMs());
    }

    @Test
    public void boundaryOfALiveClassIsItsOwnEnd() {
        long liveEnd = NOW_DAY0 + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_2, occurrence("LIVE", NOW_DAY0 - HOUR_MS, liveEnd, 0));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        assertEquals(Long.valueOf(liveEnd), state.getNextBoundaryEpochMs());
    }

    @Test
    public void boundaryFallsBackToDayEndWhenTheHeroIsOnALaterDay() {
        long earlierStart = NOW_DAY0 - 3 * HOUR_MS;
        long tomorrowStart = DAY1_END + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_2,
                occurrence("DONE", earlierStart, earlierStart + HOUR_MS, 0),
                occurrence("TOMORROW", tomorrowStart, tomorrowStart + HOUR_MS, 1));

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, NOW_DAY0);

        // 明天那节课的开始时刻晚于今天 24:00，所以最近边界是今天 24:00 —— 跨零点由 L2 广播精确覆盖。
        assertEquals("TOMORROW", state.getHero().getId());
        assertEquals(Long.valueOf(DAY0_END), state.getNextBoundaryEpochMs());
    }

    @Test
    public void boundaryIsAlwaysInTheFuture() {
        long tomorrowStart = DAY1_END + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_2,
                occurrence("LIVE", NOW_DAY0 - HOUR_MS, NOW_DAY0 + HOUR_MS, 0),
                occurrence("TOMORROW", tomorrowStart, tomorrowStart + HOUR_MS, 1));

        for (long now : new long[] { NOW_DAY0, DAY0_END - 1, DAY1_END }) {
            WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, now);
            if (state.getNextBoundaryEpochMs() != null) {
                assertTrue("boundary must be in the future for now=" + now, state.getNextBoundaryEpochMs() > now);
            }
        }
    }

    /**
     * 首尾相接的边界语义：A 的结束时刻恰好等于 B 的开始时刻。
     *
     * 在该瞬间必须显示 **B**，这依赖 `endEpochMs > now` 的严格大于语义；差一毫秒则仍显示 A。
     */
    @Test
    public void adjacentClassesSwitchExactlyAtTheSharedBoundary() {
        long sharedBoundary = NOW_DAY0 + HOUR_MS;
        WidgetSnapshot snapshot = schedule(VALID_UNTIL, DAYS_1,
                occurrence("A", NOW_DAY0, sharedBoundary, 0),
                occurrence("B", sharedBoundary, sharedBoundary + HOUR_MS, 0));

        WidgetDisplayState before = WidgetStateResolver.resolve(snapshot, sharedBoundary - 1);
        assertEquals("A", before.getHero().getId());
        assertEquals(WidgetDisplayState.HeroState.IN_PROGRESS, before.getHeroState());
        assertEquals(Long.valueOf(sharedBoundary), before.getNextBoundaryEpochMs());

        WidgetDisplayState atBoundary = WidgetStateResolver.resolve(snapshot, sharedBoundary);
        assertEquals("B", atBoundary.getHero().getId());
        assertEquals(WidgetDisplayState.HeroState.IN_PROGRESS, atBoundary.getHeroState());
    }

    @Test
    public void nonReadyStatesNeverExposeScheduleFields() {
        WidgetDisplayState[] states = { WidgetDisplayState.missing(), WidgetDisplayState.unavailable(), WidgetDisplayState.empty(),
                WidgetDisplayState.stale(), WidgetDisplayState.noUpcoming() };

        for (WidgetDisplayState state : states) {
            assertFalse(state.isReady());
            assertNull(state.getHero());
            assertTrue(state.getTodayRemaining().isEmpty());
            assertNull(state.getNextBoundaryEpochMs());
        }
    }

    // ------------------------------------------------------------------
    // 测试夹具
    // ------------------------------------------------------------------

    private static WidgetOccurrence occurrence(String id, long startEpochMs, long endEpochMs, int dayOffset) {
        return new WidgetOccurrence(id, "课程" + id, "A101", "1-2", startEpochMs, endEpochMs, "10:00", "11:40", "2026-09-07",
                dayOffset, "周一");
    }

    private static WidgetSnapshot schedule(long validUntilEpochMs, long[] dayEndEpochMs, WidgetOccurrence... entries) {
        return snapshot(WidgetSnapshot.SCHEMA_VERSION, WidgetSnapshot.Status.OK, validUntilEpochMs, Arrays.asList(entries),
                dayEndEpochMs);
    }

    private static WidgetSnapshot scheduleWithSchemaVersion(int schemaVersion, long validUntilEpochMs, long[] dayEndEpochMs) {
        return snapshot(schemaVersion, WidgetSnapshot.Status.OK, validUntilEpochMs, Collections.<WidgetOccurrence>emptyList(),
                dayEndEpochMs);
    }

    /** 只关心 status、不关心窗口与课程的快照。 */
    private static WidgetSnapshot standalone(WidgetSnapshot.Status status) {
        return snapshot(WidgetSnapshot.SCHEMA_VERSION, status, GENERATED_AT, Collections.<WidgetOccurrence>emptyList(), DAYS_1);
    }

    private static WidgetSnapshot snapshot(int schemaVersion, WidgetSnapshot.Status status, long validUntilEpochMs,
            List<WidgetOccurrence> entries, long[] dayEndEpochMs) {
        List<Long> dayEnds = new ArrayList<>();
        for (long value : dayEndEpochMs) dayEnds.add(value);
        return new WidgetSnapshot(schemaVersion, status, GENERATED_AT, validUntilEpochMs, entries, dayEnds,
                "2026-09-07T09:00:00+08:00", "Asia/Shanghai");
    }
}
