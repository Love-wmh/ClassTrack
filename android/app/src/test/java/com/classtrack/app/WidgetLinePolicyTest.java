package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * {@link WidgetLinePolicy} 的行序列测试。
 *
 * <p>这一层以前是渲染层里的私有函数，没有任何单测；而上一轮的真机缺陷（4×2 上只剩 hero、下面一大片
 * 空白）正是「显示哪些行」的判决出错。因此这里做两件事：
 *
 * <ol>
 *   <li>把三种布局样式 × 三种「已上完」策略的**既有行为**逐项钉住 —— 迁移到 Java 不许改变外观；</li>
 *   <li>把新增的「信息加密 / 双栏」也钉住，尤其是「紧凑样式下新选项不生效」这条诚实性要求。</li>
 * </ol>
 */
public class WidgetLinePolicyTest {

    private static final WidgetStyleConfig.LayoutStyle DAY_LIST = WidgetStyleConfig.LayoutStyle.DAY_LIST;
    private static final WidgetStyleConfig.LayoutStyle NEXT_UP = WidgetStyleConfig.LayoutStyle.NEXT_UP;
    private static final WidgetStyleConfig.LayoutStyle COMPACT = WidgetStyleConfig.LayoutStyle.COMPACT;

    private static final WidgetStyleConfig.FinishedPolicy SHOW_DIM = WidgetStyleConfig.FinishedPolicy.SHOW_DIM;
    private static final WidgetStyleConfig.FinishedPolicy HIDE = WidgetStyleConfig.FinishedPolicy.HIDE;
    private static final WidgetStyleConfig.FinishedPolicy COLLAPSE = WidgetStyleConfig.FinishedPolicy.COLLAPSE;

    /**
     * 「紧凑」= 主课 + 计数 + **主课之后**的课（2026-09-21 用户要求：1×2 下方原来是一整块空白）。
     *
     * <p>三种「已上完」策略与三种「大格子表现」都不改变这个序列：已上完的行排在主课之前，天然被挡在外面，
     * 课程行增强（节次列）对紧凑样式也无效果。
     */
    @Test
    public void compactListsTheClassesAfterTheHero() {
        for (WidgetStyleConfig.FinishedPolicy policy : WidgetStyleConfig.FinishedPolicy.values()) {
            for (WidgetStyleConfig.WideLayout wide : WidgetStyleConfig.WideLayout.values()) {
                WidgetBodyPlan plan = body(COMPACT, policy, wide, todayItems(), Collections.<WidgetDayItem>emptyList());

                assertKinds(plan, HERO, COUNTER, COURSE);
                assertEquals("紧凑的 hero 课名恒为一行", 1, plan.getLines().get(0).getTitleMaxLines());
                for (WidgetBodyLine line : plan.getLines()) {
                    if (line.getKind() != COURSE) continue;
                    assertEquals("紧凑只列主课之后的课", "课程还没上", line.getItem().getOccurrence().getName());
                    assertFalse("节次列只属于「信息加密」", line.isShowSections());
                }
            }
        }
    }

    /**
     * 「紧凑」的课程行用窄卡形态（课名一行、「时间 · 教室」一行）。
     *
     * <p>1×2 的格宽只有 82~105dp：时间一旦独占一列，课名就只剩三十几 dp，四个字的课名会被裁成
     * 「线性代…」；而教室挤在同一行右侧又会与课名重叠。形态由判决层给出，渲染层只照着画。
     */
    @Test
    public void compactRowsUseTheNarrowRowForm() {
        assertEquals(WidgetBodyPlan.RowForm.COMPACT,
                body(COMPACT, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getRowForm());
        assertEquals(WidgetBodyPlan.RowForm.STANDARD,
                body(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getRowForm());
        assertEquals("双栏的行形态由渲染侧显式指定，判决层保持 STANDARD",
                WidgetBodyPlan.RowForm.STANDARD,
                dualBody(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getRowForm());
    }

    /** 今天没有正在上的课时主课就是第一节还没上的课，紧凑样式同样只列它之后的课。 */
    @Test
    public void compactSkipsTheHeroItselfWhenNothingIsInProgress() {
        List<WidgetDayItem> noInProgress = items(item("还没上一", UPCOMING, "周日"), item("还没上二", UPCOMING, "周日"));

        WidgetBodyPlan plan = body(COMPACT, SHOW_DIM, ADAPTIVE, noInProgress, empty());

        assertKinds(plan, HERO, COUNTER, COURSE);
        assertEquals("课程还没上二", plan.getLines().get(2).getItem().getOccurrence().getName());
    }

    /** 今天没课、列明天时：主课是明天第一节，紧凑样式把明天其余的课列在它下面。 */
    @Test
    public void compactListsTheRestOfTomorrowWhenTodayHasNoClasses() {
        WidgetBodyPlan plan = body(COMPACT, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems());

        assertKinds(plan, HERO, COUNTER, COURSE);
        assertEquals("课程明天二", plan.getLines().get(2).getItem().getOccurrence().getName());
    }

    /** 今天全部已上完（主课落到别的日子）：紧凑样式一行课都不补，只留主课与计数。 */
    @Test
    public void compactAddsNoRowsWhenEveryRowIsFinished() {
        List<WidgetDayItem> allFinished = items(item("已上完", FINISHED, "周日"));

        assertKinds(body(COMPACT, SHOW_DIM, ADAPTIVE, allFinished, empty()), HERO, COUNTER);
    }

    /** 迁移后的存量行为：三种样式 × 三种策略各自该画哪些行。 */
    @Test
    public void existingStylesKeepTheirLineOrderForEveryFinishedPolicy() {
        assertKinds(body(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), empty()), HERO, SUMMARY, COURSE, COURSE, COURSE);
        assertKinds(body(NEXT_UP, HIDE, ADAPTIVE, todayItems(), empty()), HERO, SUMMARY, COURSE, COURSE);
        assertKinds(body(NEXT_UP, COLLAPSE, ADAPTIVE, todayItems(), empty()), HERO, SUMMARY, COURSE, COURSE, COLLAPSED);

        assertKinds(body(DAY_LIST, SHOW_DIM, ADAPTIVE, todayItems(), empty()), SUMMARY, COURSE, COURSE, COURSE, NEXT_OTHER);
        assertKinds(body(DAY_LIST, HIDE, ADAPTIVE, todayItems(), empty()), SUMMARY, COURSE, COURSE, NEXT_OTHER);
        assertKinds(body(DAY_LIST, COLLAPSE, ADAPTIVE, todayItems(), empty()), SUMMARY, COURSE, COURSE, COLLAPSED, NEXT_OTHER);
    }

    /** 今天全部被「不显示已上完」裁掉时：只如实说「今天已无课」，不回退到明天。 */
    @Test
    public void aDayWhoseRowsAreAllHiddenShowsNoCourseRows() {
        List<WidgetDayItem> allFinished = items(item("已上完", WidgetDayItem.Phase.FINISHED, "周日"));

        assertKinds(body(NEXT_UP, HIDE, ADAPTIVE, allFinished, empty()), HERO, NEXT_OTHER);
        assertKinds(body(DAY_LIST, HIDE, ADAPTIVE, allFinished, empty()), SUMMARY, NEXT_OTHER);
    }

    /** 列明天的课时不补「下一节是明天 …」：那会把同一节课说两遍。 */
    @Test
    public void tomorrowRowsDoNotGetTheNextOtherDayLine() {
        WidgetBodyPlan plan = body(DAY_LIST, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems());

        assertKinds(plan, SUMMARY, COURSE, COURSE);
    }

    /** 今天与明天都没课（长假）：一行课表都不列，只给「下一节」提示。 */
    @Test
    public void aLongHolidayNeverRendersCourseRows() {
        assertKinds(body(NEXT_UP, SHOW_DIM, ADAPTIVE, empty(), empty()), HERO, NEXT_OTHER);
        assertKinds(body(DAY_LIST, SHOW_DIM, ADAPTIVE, empty(), empty()), SUMMARY, NEXT_OTHER);
    }

    /** 信息加密只改「每行要不要多给一点信息」，不改行数、不改顺序。 */
    @Test
    public void denseAddsDetailFlagsButKeepsTheSameLines() {
        WidgetBodyPlan adaptive = body(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), empty());
        WidgetBodyPlan dense = body(NEXT_UP, SHOW_DIM, DENSE, todayItems(), empty());

        assertEquals(kinds(adaptive), kinds(dense));

        WidgetBodyLine hero = dense.getLines().get(0);
        assertEquals(WidgetBodyLine.Kind.HERO, hero.getKind());
        assertEquals("hero 课名放宽到 2 行", 2, hero.getTitleMaxLines());

        WidgetBodyLine summary = dense.getLines().get(1);
        assertEquals(WidgetBodyLine.Kind.SUMMARY, summary.getKind());
        assertTrue("汇总行补当天计数", summary.isShowCounts());

        for (WidgetBodyLine line : dense.getLines()) {
            if (line.getKind() == WidgetBodyLine.Kind.COURSE) {
                assertTrue("课程行补节次", line.isShowSections());
            }
        }

        // 课名行数由**样式**决定、与尺寸无关：紧凑 1 行（2×2 逐像素不变依赖它），其余 2 行
        // （字号随格子变大后，一行放不下「毛泽东思想和中国特色社会主义理论体系概论」）。
        assertEquals("默认样式下 hero 两行", 2, adaptive.getLines().get(0).getTitleMaxLines());
        assertFalse(adaptive.getLines().get(1).isShowCounts());
        assertFalse(adaptive.getLines().get(2).isShowSections());
    }

    /** 双栏只改排布、不改内容：同一个选项下列序列必须与单栏完全一致。 */
    @Test
    public void dualColumnKeepsTheSameLineSequence() {
        WidgetBodyPlan adaptive = body(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), empty());
        WidgetBodyPlan dual = body(NEXT_UP, SHOW_DIM, TWO_COLUMN, todayItems(), empty());

        assertEquals(kinds(adaptive), kinds(dual));
        assertEquals("左栏放首行（hero）", 1, dual.getHeaderLineCount());
    }

    /** 「紧凑」样式不显示课表，信息加密对它无效果（与配置页的灰显同源）。 */
    @Test
    public void denseIsIgnoredByCompactStyle() {
        WidgetBodyLine hero = body(COMPACT, SHOW_DIM, DENSE, todayItems(), empty()).getLines().get(0);

        assertEquals("紧凑样式下不该偷偷放宽课名行数", 1, hero.getTitleMaxLines());
    }

    /** 双栏切分点：有 hero 时是 hero，没有 hero 时是汇总行；空序列为 0。 */
    @Test
    public void headerLineIsAlwaysTheFirstNonEmptyLine() {
        assertEquals(WidgetBodyLine.Kind.HERO, body(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getLines().get(0).getKind());
        assertEquals(WidgetBodyLine.Kind.SUMMARY, body(DAY_LIST, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getLines().get(0).getKind());
        assertEquals("有行时左栏放一行", 1, body(DAY_LIST, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getHeaderLineCount());
        assertEquals("长假时仍有「汇总 + 下一节」两行，左栏拿首行", 1,
                body(DAY_LIST, SHOW_DIM, ADAPTIVE, empty(), empty()).getHeaderLineCount());
    }

    /** 行序列为空时切分点必须收敛到 0，不能让渲染层去 take(1) 一个空列表。 */
    @Test
    public void emptyLineSequenceMeansNoHeaderLine() {
        assertEquals(0, new WidgetBodyPlan(Collections.<WidgetBodyLine>emptyList(), 1).getHeaderLineCount());
        assertEquals(0, new WidgetBodyPlan(null, 5).getHeaderLineCount());
    }

    /** 课程行必须带着自己的下标：首行要留出与汇总行之间更大的间距。 */
    @Test
    public void courseLinesCarryTheirIndexInOrder() {
        List<WidgetBodyLine> lines = body(DAY_LIST, SHOW_DIM, ADAPTIVE, todayItems(), empty()).getLines();
        int expectedIndex = 0;

        for (WidgetBodyLine line : lines) {
            if (line.getKind() != WidgetBodyLine.Kind.COURSE) continue;
            assertEquals(expectedIndex, line.getIndex());
            assertTrue("课程行必须带着自己的那节课", line.getItem() != null);
            assertEquals("课程行按时间顺序带上原课程", "课程" + new String[] {"已上完", "正在上", "还没上"}[expectedIndex],
                    line.getItem().getOccurrence().getName());
            expectedIndex++;
        }
        assertEquals(3, expectedIndex);
    }

    private static final WidgetDayItem.Phase FINISHED = WidgetDayItem.Phase.FINISHED;
    private static final WidgetDayItem.Phase IN_PROGRESS = WidgetDayItem.Phase.IN_PROGRESS;
    private static final WidgetDayItem.Phase UPCOMING = WidgetDayItem.Phase.UPCOMING;

    private static final WidgetBodyLine.Kind HERO = WidgetBodyLine.Kind.HERO;
    private static final WidgetBodyLine.Kind HERO_EMPTY = WidgetBodyLine.Kind.HERO_EMPTY;
    private static final WidgetBodyLine.Kind SUMMARY = WidgetBodyLine.Kind.SUMMARY;
    private static final WidgetBodyLine.Kind COUNTER = WidgetBodyLine.Kind.COUNTER;
    private static final WidgetBodyLine.Kind COLLAPSED = WidgetBodyLine.Kind.COLLAPSED;
    private static final WidgetBodyLine.Kind NEXT_OTHER = WidgetBodyLine.Kind.NEXT_OTHER;
    private static final WidgetBodyLine.Kind COURSE = WidgetBodyLine.Kind.COURSE;
    private static final WidgetBodyLine.Kind SUMMARY_COUNTS = WidgetBodyLine.Kind.SUMMARY_COUNTS;
    private static final WidgetBodyLine.Kind MID_NEXT = WidgetBodyLine.Kind.MID_NEXT;
    private static final WidgetBodyLine.Kind FOOTER_LAST = WidgetBodyLine.Kind.FOOTER_LAST;

    private static final WidgetStyleConfig.WideLayout ADAPTIVE = WidgetStyleConfig.WideLayout.ADAPTIVE;
    private static final WidgetStyleConfig.WideLayout DENSE = WidgetStyleConfig.WideLayout.DENSE;
    private static final WidgetStyleConfig.WideLayout TWO_COLUMN = WidgetStyleConfig.WideLayout.TWO_COLUMN;

    private static WidgetBodyPlan body(WidgetStyleConfig.LayoutStyle style, WidgetStyleConfig.FinishedPolicy policy,
            WidgetStyleConfig.WideLayout wide, List<WidgetDayItem> today, List<WidgetDayItem> tomorrow) {
        return body(style, policy, wide, today, tomorrow, true, false);
    }

    /**
     * 今天已经没有可上的课（hero 落在别的日子）时的单栏行序列。
     *
     * <p>渲染层传进来的 `heroIsToday` 就是 `heroState != UPCOMING_OTHER_DAY`。
     */
    private static WidgetBodyPlan emptyHeroBody(WidgetStyleConfig.LayoutStyle style,
            WidgetStyleConfig.FinishedPolicy policy, WidgetStyleConfig.WideLayout wide, List<WidgetDayItem> today,
            List<WidgetDayItem> tomorrow) {
        return body(style, policy, wide, today, tomorrow, false, false);
    }

    private static WidgetBodyPlan body(WidgetStyleConfig.LayoutStyle style, WidgetStyleConfig.FinishedPolicy policy,
            WidgetStyleConfig.WideLayout wide, List<WidgetDayItem> today, List<WidgetDayItem> tomorrow,
            boolean heroIsToday, boolean dualColumn) {
        WidgetDayPlan dayPlan = WidgetDayPlan.resolve(today, tomorrow, policy);
        return WidgetLinePolicy.resolve(new WidgetStyleConfig(style, policy, wide), dayPlan, heroIsToday, dualColumn);
    }

    /** 双栏（几何真的够宽）时的行序列：会比单栏多一组静态富内容行。 */
    private static WidgetBodyPlan dualBody(WidgetStyleConfig.LayoutStyle style, WidgetStyleConfig.FinishedPolicy policy,
            WidgetStyleConfig.WideLayout wide, List<WidgetDayItem> today, List<WidgetDayItem> tomorrow) {
        return body(style, policy, wide, today, tomorrow, true, true);
    }

    /** 双栏富内容：汇总计数行 + 左卡中缝「下一节」行 + 列表底部「今天最后一节」行，顺序固定。 */
    @Test
    public void dualColumnAddsStaticRichLinesInFixedOrder() {
        WidgetBodyPlan plan = dualBody(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), tomorrowItems());

        assertEquals(SUMMARY_COUNTS, plan.getLines().get(3).getKind());
        assertEquals(FOOTER_LAST, plan.getLines().get(plan.getLines().size() - 1).getKind());
        assertEquals("左栏 = hero + 中缝行", 2, plan.getHeaderLineCount());
        assertEquals(MID_NEXT, plan.getLines().get(1).getKind());
    }

    /** 单栏不出现双栏富内容：手机两个预设的观感因此与改动前同源。 */
    @Test
    public void singleColumnKeepsNoRichLines() {
        WidgetBodyPlan plan = body(NEXT_UP, SHOW_DIM, ADAPTIVE, todayItems(), tomorrowItems());

        for (WidgetBodyLine line : plan.getLines()) {
            assertNotEquals(SUMMARY_COUNTS, line.getKind());
            assertNotEquals(FOOTER_LAST, line.getKind());
            assertNotEquals(MID_NEXT, line.getKind());
        }
        assertEquals(1, plan.getHeaderLineCount());
    }

    /** 课名行数：紧凑样式 1 行（2×2 逐像素不变依赖它），其余样式 2 行（字号随格子变大后一行放不下）。 */
    @Test
    public void heroTitleLinesFollowTheStyleNotTheSize() {
        assertEquals(1, heroLines(COMPACT, SHOW_DIM, ADAPTIVE));
        assertEquals(2, heroLines(NEXT_UP, SHOW_DIM, ADAPTIVE));
    }

    private static int heroLines(WidgetStyleConfig.LayoutStyle style, WidgetStyleConfig.FinishedPolicy policy,
            WidgetStyleConfig.WideLayout wide) {
        WidgetBodyPlan plan = body(style, policy, wide, todayItems(), tomorrowItems());
        for (WidgetBodyLine line : plan.getLines()) {
            if (line.getKind() == HERO) {
                return line.getTitleMaxLines();
            }
        }
        return 0;
    }

    /**
     * 今天没有可上的课时，hero 位置换成空课态：不再把明天的课冒充成「接下来」。
     *
     * <p>它只影响有 hero 行的两种样式；全天课表本来就没有 hero 行，因此必须与改动前完全一致。
     */
    @Test
    public void heroBecomesTheEmptyStateWhenTodayHasNoClassLeft() {
        assertKinds(emptyHeroBody(NEXT_UP, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems()), HERO_EMPTY, SUMMARY, COURSE,
                COURSE);
        // 紧凑样式会继续列出「主课之后的课」：空课态下没有主课可跳过，因此明天两节都在。
        assertKinds(emptyHeroBody(COMPACT, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems()), HERO_EMPTY, COUNTER, COURSE,
                COURSE);
        // 长假：紧凑档的计数行只说「今天无课」，没有「下一节在哪天」就整张卡都看不到下一节课。
        assertKinds(emptyHeroBody(COMPACT, SHOW_DIM, ADAPTIVE, empty(), empty()), HERO_EMPTY, COUNTER, NEXT_OTHER);
        assertKinds(emptyHeroBody(DAY_LIST, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems()), SUMMARY, COURSE, COURSE);
    }

    /** 空课态的两个 flag：醒目行文案跟随「今天原本有没有课」，次要行文案跟随**样式**（不是格子尺寸）。 */
    @Test
    public void heroEmptyFlagsFollowThePlanAndTheStyle() {
        List<WidgetDayItem> allFinished = items(item("已上完", FINISHED, "周日"));

        WidgetBodyLine nextUp = emptyHeroBody(NEXT_UP, SHOW_DIM, ADAPTIVE, allFinished, tomorrowItems()).getLines().get(0);
        WidgetBodyLine compact = emptyHeroBody(COMPACT, SHOW_DIM, ADAPTIVE, allFinished, tomorrowItems()).getLines().get(0);

        assertEquals(HERO_EMPTY, nextUp.getKind());
        assertTrue("今天原本有课 → 醒目行写「今天已无课」", nextUp.isTodayHadClasses());
        assertFalse("「接下来」用长句", nextUp.isShortCopy());
        assertTrue("「紧凑」用短句", compact.isShortCopy());
        assertFalse("今天本来就没课 → 醒目行写「今天无课」",
                emptyHeroBody(NEXT_UP, SHOW_DIM, ADAPTIVE, empty(), empty()).getLines().get(0).isTodayHadClasses());
    }

    /** 今天已上完、但今天仍有可见行时，hero 不再承担「下一节在哪天」，这一行必须补上。 */
    @Test
    public void finishedTodayStillGetsTheNextOtherDayLine() {
        List<WidgetDayItem> allFinished = items(item("已上完", FINISHED, "周日"));

        assertKinds(emptyHeroBody(NEXT_UP, SHOW_DIM, ADAPTIVE, allFinished, tomorrowItems()), HERO_EMPTY, SUMMARY, COURSE,
                NEXT_OTHER);
        assertKinds(emptyHeroBody(COMPACT, SHOW_DIM, ADAPTIVE, allFinished, tomorrowItems()), HERO_EMPTY, COUNTER,
                NEXT_OTHER);
        // 课表列的就是明天时不补：那是把同一节课说两遍（改动前的口径）。
        assertKinds(emptyHeroBody(NEXT_UP, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems()), HERO_EMPTY, SUMMARY, COURSE,
                COURSE);
        // 「全部隐藏」策略下今天一行都不可见 → 走「没有课程行」那一支，同样有「下一节」。
        assertKinds(emptyHeroBody(NEXT_UP, HIDE, ADAPTIVE, allFinished, tomorrowItems()), HERO_EMPTY, NEXT_OTHER);
    }

    /** 空课态也占左栏：双栏的切分点必须把它算作 header，否则那半张卡会是空的。 */
    @Test
    public void heroEmptyStaysInTheLeftColumn() {
        WidgetBodyPlan dual = body(NEXT_UP, SHOW_DIM, ADAPTIVE, empty(), tomorrowItems(), false, true);

        assertEquals(HERO_EMPTY, dual.getLines().get(0).getKind());
        assertEquals("左栏 = 空课态 + 中缝行", 2, dual.getHeaderLineCount());
    }

    /** 一天里「已上完 + 正在进行 + 还有一节」，这样三种「已上完」策略的差异都能看出来。 */
    private static List<WidgetDayItem> todayItems() {
        return items(
                item("已上完", FINISHED, "周日"),
                item("正在上", IN_PROGRESS, "周日"),
                item("还没上", UPCOMING, "周日"));
    }

    private static List<WidgetDayItem> tomorrowItems() {
        return items(item("明天一", UPCOMING, "周一"), item("明天二", UPCOMING, "周一"));
    }

    private static List<WidgetDayItem> empty() {
        return Collections.emptyList();
    }

    private static List<WidgetDayItem> items(WidgetDayItem... items) {
        return Arrays.asList(items);
    }

    private static WidgetDayItem item(String id, WidgetDayItem.Phase phase, String weekdayLabel) {
        WidgetOccurrence occurrence = new WidgetOccurrence(id, "课程" + id, "A101", "1-2", 0L, 0L, "10:00", "11:40",
                "2026-09-07", 0, weekdayLabel);
        return new WidgetDayItem(occurrence, phase);
    }

    private static List<WidgetBodyLine.Kind> kinds(WidgetBodyPlan plan) {
        List<WidgetBodyLine.Kind> kinds = new ArrayList<>();
        for (WidgetBodyLine line : plan.getLines()) {
            kinds.add(line.getKind());
        }
        return kinds;
    }

    private static void assertKinds(WidgetBodyPlan plan, WidgetBodyLine.Kind... expected) {
        assertEquals(Arrays.asList(expected), kinds(plan));
    }
}
