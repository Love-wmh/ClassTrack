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
 * 边界全部钉死，包括「长假不列课表」和「今天有课但全被隐藏时也不回退到明天」。
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

    @Test
    public void hiddenFinishedDayDoesNotFallBackToTomorrow() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                HIDE);

        assertEquals("用户刚选了「不显示已上完」，不能把明天的课塞进来冒充今天的", WidgetDayPlan.Source.NONE,
                plan.getSource());
        assertTrue(plan.getRows().isEmpty());
        assertTrue("文案要说「今天已无课」而不是「今天无课」", plan.isTodayHadClasses());
        assertEquals(0, plan.getCollapsedFinishedCount());
    }

    @Test
    public void collapsedPolicyKeepsCountEvenWhenNoRowIsVisible() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE_A", WidgetDayItem.Phase.FINISHED, "周三"), item("DONE_B", WidgetDayItem.Phase.FINISHED, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                COLLAPSE);

        assertEquals(WidgetDayPlan.Source.NONE, plan.getSource());
        assertTrue(plan.getRows().isEmpty());
        assertEquals("折叠计数是这一档唯一的信息，不能丢", 2, plan.getCollapsedFinishedCount());
    }

    @Test
    public void dimPolicyKeepsFinishedRowsOnToday() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三")),
                items(item("TOMORROW", WidgetDayItem.Phase.UPCOMING, "周四")),
                SHOW_DIM);

        assertEquals(WidgetDayPlan.Source.TODAY, plan.getSource());
        assertEquals("灰显策略下已上完的课仍留在今天的列表里", 1, plan.getRows().size());
        assertTrue(plan.getRows().get(0).isFinished());
    }

    @Test
    public void missingPolicyFallsBackToDefaultVisibleRows() {
        WidgetDayPlan plan = WidgetDayPlan.resolve(
                items(item("DONE", WidgetDayItem.Phase.FINISHED, "周三")),
                Collections.<WidgetDayItem>emptyList(),
                null);

        assertEquals("配置缺失不该把整天的课抹掉", WidgetDayPlan.Source.TODAY, plan.getSource());
        assertEquals(1, plan.getRows().size());
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
