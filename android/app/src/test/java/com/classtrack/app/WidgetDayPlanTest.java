package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * {@link WidgetDayPlan} 的规则测试：今天 / 明天 / 长假三档该怎么选。
 *
 * <p>这些规则直接对应真机回测发现的问题：周末「今天没课」时卡片只剩两行、下面一大片空白，
 * 而一旦无脑回退到「下一个有课的日子」，用户在国庆长假里又会一直看到课表。因此这里把三档
 * 边界全部钉死：包括「长假不列课表」（不回退到「下一个有课的日子」），以及 2026-09-28 的新口径 ——
 * 「今天的课已上完」也要列明天（三种「已上完」策略都算）。
 */
public class WidgetDayPlanTest {
    private static final WidgetStyleConfig.FinishedPolicy SHOW_DIM = WidgetStyleConfig.FinishedPolicy.SHOW_DIM;
    private static final WidgetStyleConfig.FinishedPolicy HIDE = WidgetStyleConfig.FinishedPolicy.HIDE;
    private static final WidgetStyleConfig.FinishedPolicy COLLAPSE = WidgetStyleConfig.FinishedPolicy.COLLAPSE;

    @Test
    public void todayRowsWinOverTomorrow() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("TODAY", WidgetDayItem.Phase.UPCOMING, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                SHOW_DIM);

        assertEquals(WidgetDayPlan.Source.TODAY, plan.getSource());
        assertEquals(1, plan.getRows().size());
        assertEquals("TODAY", plan.getRows().get(0).getOccurrence().getId());
        assertEquals("汇总行用今天的星期", "周三", plan.getWeekdayLabel());
        assertTrue("今天原本有课", plan.isTodayHadClasses());
        assertTrue(plan.hasRows());
    }

    @Test
    public void fallsBackToTomorrowWhenTodayIsEmpty() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                Collections.<WidgetDayItem>emptyList(),
                items(item("A", WidgetDayItem.Phase.UPCOMING, "周四"), item("B", WidgetDayItem.Phase.UPCOMING, "周四")),
                SHOW_DIM);

        assertEquals(WidgetDayPlan.Source.TOMORROW, plan.getSource());
        assertEquals("明天的两节都要列出来", 2, plan.getRows().size());
        assertEquals("汇总行必须用明天的星期，否则会被读成今天", "周四", plan.getWeekdayLabel());
        assertFalse("今天本来就没课", plan.isTodayHadClasses());
    }

    @Test
    public void noRowsWhenTodayAndTomorrowAreBothEmpty() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                Collections.<WidgetDayItem>emptyList(),
                Collections.<WidgetDayItem>emptyList(),
                SHOW_DIM);

        assertEquals("长假：今天与明天都没课，一行课表都不列", WidgetDayPlan.Source.NONE, plan.getSource());
        assertTrue(plan.getRows().isEmpty());
        assertEquals("", plan.getWeekdayLabel());
        assertFalse(plan.isTodayHadClasses());
    }

    /**
     * 「不显示已上完」把今天裁空之后同样要列明天（2026-09-28 用户口径）。
     *
     * <p>改动前这里是反向断言（「不能把明天的课塞进来冒充今天的」）。敢反过来是因为 hero 现在画的是
     * 「今天已无课」的空课态、而汇总行明确写「明天」—— 两者合起来不可能被读成今天还有课。
     */
    @Test
    public void hiddenFinishedDayFallsBackToTomorrow() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                HIDE);

        assertEquals(WidgetDayPlan.Source.TOMORROW, plan.getSource());
        assertEquals(1, plan.getRows().size());
        assertEquals("TOMORROW", plan.getRows().get(0).getOccurrence().getId());
        assertEquals("汇总行用明天的星期", "周四", plan.getWeekdayLabel());
        assertTrue("空课态醒目行要说「今天已无课」而不是「今天无课」", plan.isTodayHadClasses());
        assertEquals("没有可见行可折叠", 0, plan.getCollapsedFinishedCount());
    }

    /** 「折叠」策略下今天一行都不画，但折叠计数要跟着回退到明天一起走（用户显式选的策略不能丢）。 */
    @Test
    public void collapsedFinishedDayFallsBackToTomorrowAndKeepsTheCount() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE_A", WidgetDayItem.Phase.FINISHED, "周三"), item("DONE_B", WidgetDayItem.Phase.FINISHED, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                COLLAPSE);

        assertEquals(WidgetDayPlan.Source.TOMORROW, plan.getSource());
        assertEquals("列的是明天的课", 1, plan.getRows().size());
        assertEquals("汇总行用明天的星期", "周四", plan.getWeekdayLabel());
        assertEquals("折叠计数是这一档唯一的信息，不能丢", 2, plan.getCollapsedFinishedCount());
        assertTrue(plan.isTodayHadClasses());
    }

    /** 「显示已上完」也是同一档：今天没有可上的课了就一样列明天（2026-09-28 口径：三种策略都切）。 */
    @Test
    public void dimPolicyAlsoFallsBackToTomorrowOnceTodayIsDone() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                SHOW_DIM);

        assertEquals(WidgetDayPlan.Source.TOMORROW, plan.getSource());
        assertEquals("TOMORROW", plan.getRows().get(0).getOccurrence().getId());
        assertTrue("今天原本有课，空课态要说「今天已无课」", plan.isTodayHadClasses());
    }

    /** 回归：白天还没上完时，「显示已上完」照旧把已上完的灰课留在今天的列表里。 */
    @Test
    public void dimPolicyKeepsFinishedRowsWhileTodayIsStillGoing() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三"),
                        item("NEXT", WidgetDayItem.Phase.UPCOMING, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                SHOW_DIM);

        assertEquals(WidgetDayPlan.Source.TODAY, plan.getSource());
        assertEquals("灰显策略下已上完的课仍留在今天的列表里", 2, plan.getRows().size());
        assertTrue(plan.getRows().get(0).isFinished());
        assertEquals("NEXT", plan.getRows().get(1).getOccurrence().getId());
    }

    /** 今天已上完、明天也没课（周五晚上 / 长假）：不列课表，但要如实说「今天已无课」。 */
    @Test
    public void finishedDayWithoutTomorrowNeverListsCourses() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三")),
                Collections.<WidgetDayItem>emptyList(),
                HIDE);

        assertEquals(WidgetDayPlan.Source.NONE, plan.getSource());
        assertTrue(plan.getRows().isEmpty());
        assertTrue(plan.isTodayHadClasses());
        assertEquals("NONE 档仍保留今天的星期文案（当前没有消费方，但语义不要无谓地改）", "周三", plan.getWeekdayLabel());
    }
    @Test
    public void missingPolicyFallsBackToDefaultVisibleRows() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三"),
                        item("NEXT", WidgetDayItem.Phase.UPCOMING, "周三")),
                Collections.<WidgetDayItem>emptyList(),
                null);

        assertEquals("配置缺失不该把整天的课抹掉", WidgetDayPlan.Source.TODAY, plan.getSource());
        assertEquals(2, plan.getRows().size());
    }
    @Test
    public void nullItemsAreTreatedAsEmpty() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(null, null, SHOW_DIM);

        assertEquals(WidgetDayPlan.Source.NONE, plan.getSource());
        assertTrue(plan.getRows().isEmpty());
        assertEquals("", plan.getWeekdayLabel());
    }

    @Test
    public void rowsAreNotExternallyMutable() {
        List<WidgetDayItem> tomorrow = new ArrayList<>(items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")));
        WidgetDayPlan plan = WidgetDayPlan.resolve(Collections.<WidgetDayItem>emptyList(), tomorrow, SHOW_DIM);

        assertSame("行列表直接复用已标好阶段的对象，渲染层不需要复制", tomorrow.get(0), plan.getRows().get(0));
        tomorrow.clear();
        assertEquals("裁决结果不能被调用方后续改动影响", 1, plan.getRows().size());
    }

    private static List<WidgetDayItem> items(WidgetDayItem... items) {
        return Arrays.asList(items);
    }

    private static WidgetDayItem item(String id, WidgetDayItem.Phase phase, String weekdayLabel) {
        WidgetOccurrence occurrence = new WidgetOccurrence(id, "课程" + id, "A101", "1-2", 0L, 0L, "10:00", "11:40",
                "2026-09-07", 0, weekdayLabel);
        return new WidgetDayItem(occurrence, phase);
    }
}
