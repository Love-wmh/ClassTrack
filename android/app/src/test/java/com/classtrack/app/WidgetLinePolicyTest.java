package com.classtrack.app;

import static org.junit.Assert.assertEquals;
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

    /** 「紧凑」样式永远只有 hero + 计数行，三种策略与三种「大格子表现」都不改变它。 */
    @Test
    public void compactStyleNeverGrowsAList() {
        for (WidgetStyleConfig.FinishedPolicy policy : WidgetStyleConfig.FinishedPolicy.values()) {
            for (WidgetStyleConfig.WideLayout wide : WidgetStyleConfig.WideLayout.values()) {
                WidgetBodyPlan plan = body(COMPACT, policy, wide, todayItems(), Collections.<WidgetDayItem>emptyList());

                assertKinds(plan, WidgetBodyLine.Kind.HERO, WidgetBodyLine.Kind.COUNTER);
            }
        }
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

        assertEquals("默认样式下 hero 仍是一行", 1, adaptive.getLines().get(0).getTitleMaxLines());
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
    private static final WidgetBodyLine.Kind SUMMARY = WidgetBodyLine.Kind.SUMMARY;
    private static final WidgetBodyLine.Kind COUNTER = WidgetBodyLine.Kind.COUNTER;
    private static final WidgetBodyLine.Kind COLLAPSED = WidgetBodyLine.Kind.COLLAPSED;
    private static final WidgetBodyLine.Kind NEXT_OTHER = WidgetBodyLine.Kind.NEXT_OTHER;
    private static final WidgetBodyLine.Kind COURSE = WidgetBodyLine.Kind.COURSE;

    private static final WidgetStyleConfig.WideLayout ADAPTIVE = WidgetStyleConfig.WideLayout.ADAPTIVE;
    private static final WidgetStyleConfig.WideLayout DENSE = WidgetStyleConfig.WideLayout.DENSE;
    private static final WidgetStyleConfig.WideLayout TWO_COLUMN = WidgetStyleConfig.WideLayout.TWO_COLUMN;

    private static WidgetBodyPlan body(WidgetStyleConfig.LayoutStyle style, WidgetStyleConfig.FinishedPolicy policy,
            WidgetStyleConfig.WideLayout wide, List<WidgetDayItem> today, List<WidgetDayItem> tomorrow) {
        WidgetDayPlan dayPlan = WidgetDayPlan.resolve(today, tomorrow, policy);
        return WidgetLinePolicy.resolve(new WidgetStyleConfig(style, policy, wide), dayPlan);
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
