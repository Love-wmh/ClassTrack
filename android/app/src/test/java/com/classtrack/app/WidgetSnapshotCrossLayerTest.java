package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.BeforeClass;
import org.junit.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 跨层测试：用 **Web 侧真实产出**的快照夹具喂给原生解析器与状态解析器。
 *
 * 夹具 `src/test/resources/widget-snapshot-v1.json` 由 `app/lib/widget-snapshot.ts` 的
 * `buildWidgetSnapshot` 实际生成（2026-09-21 09:00、第一周 2026-09-07、20 教学周、
 * 高等数学 周一 10:00-11:40、大学物理 周三 13:30-15:10），因此这一组用例同时验证了
 * 「两侧契约一致」与「原生侧不需要设备即可正确处理长期未打开 App 的场景」。
 *
 * 断言刻意只用**快照自身派生**的时刻，不硬编码 epoch：夹具里的绝对时间取决于生成时的
 * 本机时区，硬编码会让用例在 CI（UTC）与本地（UTC+8）之一必然失败。
 */
public class WidgetSnapshotCrossLayerTest {
    private static final long DAY_MS = 24L * 60L * 60L * 1000L;
    private static final long MINUTE_MS = 60L * 1000L;

    /** 生成夹具时故意写入的敏感值；它们绝不允许出现在快照里。 */
    private static final String[] SENSITIVE_SENTINELS = {
        "SENSITIVE-TEACHER-VALUE", "SENSITIVE-COURSE-ID", "SENSITIVE-CLASS-ID"
    };

    private static String fixtureJson;
    private static WidgetSnapshot snapshot;

    @BeforeClass
    public static void loadFixture() throws Exception {
        try (InputStream stream = WidgetSnapshotCrossLayerTest.class.getClassLoader()
                .getResourceAsStream("widget-snapshot-v1.json")) {
            assertNotNull("缺少夹具 widget-snapshot-v1.json", stream);
            fixtureJson = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }

        snapshot = WidgetSnapshotParser.parse(fixtureJson);
        assertNotNull("Web 侧产出的快照必须能被原生解析器接受", snapshot);
    }

    @Test
    public void webProducedSnapshotIsAcceptedByTheNativeParser() {
        assertEquals(WidgetSnapshot.SCHEMA_VERSION, snapshot.getSchemaVersion());
        assertEquals(WidgetSnapshot.Status.OK, snapshot.getStatus());
        assertTrue("夹具应当包含课程", snapshot.getEntries().size() > 0);
        assertTrue("夹具应当覆盖多天", snapshot.getDayEndEpochMs().size() > 100);
        assertEquals("高等数学", snapshot.getEntries().get(0).getName());
        assertEquals("教三201", snapshot.getEntries().get(0).getClassroom());
    }

    /** N3：快照只含展示所需字段，教师、课程号、教学班号都不得过桥。 */
    @Test
    public void snapshotNeverCarriesFieldsBeyondTheDisplayContract() {
        for (String sentinel : SENSITIVE_SENTINELS) {
            assertFalse("快照不应包含 " + sentinel, fixtureJson.contains(sentinel));
        }
    }

    /** 两层对 `dayOffset` 下标的语义必须一致，否则原生会把某天误判成「没课」。 */
    @Test
    public void dayOffsetAndDayEndsStayConsistentAcrossLayers() {
        List<Long> dayEnds = snapshot.getDayEndEpochMs();
        for (int index = 1; index < dayEnds.size(); index++) {
            assertTrue("dayEndEpochMs 必须严格递增", dayEnds.get(index) > dayEnds.get(index - 1));
        }
        for (WidgetOccurrence occurrence : snapshot.getEntries()) {
            assertTrue("dayOffset 必须落在 dayEndEpochMs 的下标范围内", occurrence.getDayOffset() < dayEnds.size());
            assertTrue("每节课必须落在它所属那一天之内",
                    occurrence.getStartEpochMs() < dayEnds.get(occurrence.getDayOffset()));
            assertTrue(occurrence.getEndEpochMs() <= dayEnds.get(occurrence.getDayOffset()));
        }
    }

    /**
     * prd C7：「长期不打开 App」时，原生侧仍能选出正确课程。
     *
     * 夹具生成于第 0 天，这里把 now 直接推到**第 42 天**（跨 6 周），中间没有任何渲染；
     * 原生只靠 epoch 比较就应选中第 42 天的课，而不是落到过期态或误报「今日无课」。
     */
    @Test
    public void nativeSideStillPicksTheRightCourseSixWeeksLater() {
        List<Long> dayEnds = snapshot.getDayEndEpochMs();
        long now = dayEnds.get(41) + 1;

        assertTrue("第 42 天仍在覆盖窗口内", now < snapshot.getValidUntilEpochMs());

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, now);

        assertTrue("超过一个多月后仍应处于可展示状态", state.isReady());
        assertEquals("2026-11-02", state.getHero().getDayKey());
        assertEquals(42, state.getHero().getDayOffset());
        assertEquals("高等数学", state.getHero().getName());
        assertEquals(WidgetDisplayState.HeroState.UPCOMING, state.getHeroState());
    }

    /** 覆盖窗口的最后一个完整天也仍然可用；再往后一天才进入过期态。 */
    @Test
    public void coverageWindowEndsExactlyAtTheLastCoveredDay() {
        List<Long> dayEnds = snapshot.getDayEndEpochMs();
        int lastIndex = dayEnds.size() - 1;

        long insideLastDay = dayEnds.get(lastIndex) - MINUTE_MS;
        // 学期最后一个覆盖日的末尾：快照仍然有效（未过期），但学期里的课都上完了，
        // 因此正确结果是 NO_UPCOMING（「本学期课程已结束」），而不是 READY 或 STALE。
        assertEquals("覆盖窗口内、学期已结束时应是 NO_UPCOMING",
                WidgetDisplayState.Type.NO_UPCOMING, WidgetStateResolver.resolve(snapshot, insideLastDay).getType());

        assertEquals("越过覆盖窗口即进入过期态",
                WidgetDisplayState.Type.STALE,
                WidgetStateResolver.resolve(snapshot, snapshot.getValidUntilEpochMs() + 1).getType());
    }

    /**
     * prd C11：课已开始但未结束时仍是 hero，且标记为「正在进行」。
     *
     * 这里直接取夹具里第一节课的开始时刻 + 1 分钟，因此不依赖任何硬编码时间。
     */
    @Test
    public void inProgressSemanticsHoldOnRealWebPayload() {
        WidgetOccurrence first = snapshot.getEntries().get(0);
        long now = first.getStartEpochMs() + MINUTE_MS;

        WidgetDisplayState state = WidgetStateResolver.resolve(snapshot, now);

        assertTrue(state.isReady());
        assertEquals(first.getId(), state.getHero().getId());
        assertEquals(WidgetDisplayState.HeroState.IN_PROGRESS, state.getHeroState());
        assertEquals(0, state.getHero().getDayOffset());
        assertTrue("进行中的课不应重复出现在今日剩余里",
                state.getTodayRemaining().stream().noneMatch(item -> item.getId().equals(first.getId())));
    }

    /** 「今日剩余」随着时间推进逐条减少，且不会把已结束的课留在列表里。 */
    @Test
    public void todayRemainingShrinksAsTheDayGoesOn() {
        WidgetOccurrence first = snapshot.getEntries().get(0);
        List<WidgetOccurrence> dayZero = snapshot.getEntries();
        long day0Count = dayZero.stream().filter(item -> item.getDayOffset() == 0).count();
        assertTrue("夹具第 0 天应当有课", day0Count > 0);

        long startOfDay = first.getStartEpochMs() - MINUTE_MS;
        WidgetDisplayState beforeAnyClass = WidgetStateResolver.resolve(snapshot, startOfDay);
        assertEquals("上课前，第 0 天的课都应出现在今日剩余里", (int) day0Count - 1, beforeAnyClass.getTodayRemaining().size());

        long afterFirstClass = first.getEndEpochMs() + MINUTE_MS;
        WidgetDisplayState afterFirstClassState = WidgetStateResolver.resolve(snapshot, afterFirstClass);
        assertTrue("第一节课结束后它必须从今日剩余里消失",
                afterFirstClassState.getTodayRemaining().stream().noneMatch(item -> item.getId().equals(first.getId())));
    }

    /** 快照覆盖约 4 个月，因此「一天只有一节课」的日子也必须能正确定位。 */
    @Test
    public void longCoverageWindowIsUsableForEveryWeek() {
        List<Long> dayEnds = snapshot.getDayEndEpochMs();
        int readyDays = 0;

        // 每个教学周的周一都探测一次，确认整段窗口都能被解释。
        for (int dayOffset = 0; dayOffset + 7 < dayEnds.size(); dayOffset += 7) {
            long now = dayEnds.get(dayOffset) + MINUTE_MS;
            if (WidgetStateResolver.resolve(snapshot, now).getType() == WidgetDisplayState.Type.READY) {
                readyDays++;
            }
        }

        assertTrue("覆盖窗口内的大多数周都应可展示，实测可展示周数=" + readyDays, readyDays >= 10);
    }

    @Test
    public void coverageWindowSpansRoughlyOneSemester() {
        long spanMs = snapshot.getValidUntilEpochMs() - snapshot.getGeneratedAtEpochMs();
        long spanDays = spanMs / DAY_MS;

        // 生成日是第 3 周周一，20 教学周 ⇒ 剩余约 126 天。
        assertTrue("覆盖窗口应延伸到学期末，实测 " + spanDays + " 天", spanDays >= 120 && spanDays <= 130);
    }
}
