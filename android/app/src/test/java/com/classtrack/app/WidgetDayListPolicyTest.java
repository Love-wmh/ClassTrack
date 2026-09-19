package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

/**
 * {@link WidgetDayListPolicy} 的三种裁剪策略。
 *
 * 这些断言取代了「靠截图判断三种策略对不对」的做法：截图只能证明某一刻某一屏的样子，
 * 无法覆盖「当天第一节已上完」「全天已上完」这些边界。
 */
public class WidgetDayListPolicyTest {
    private static final long BASE = 1_800_000_000_000L;

    @Test
    public void showDimKeepsEveryRowIncludingFinishedOnes() {
        WidgetDayListPolicy.Result result = WidgetDayListPolicy.apply(
                day(phase("A", WidgetDayItem.Phase.FINISHED), phase("B", WidgetDayItem.Phase.IN_PROGRESS),
                        phase("C", WidgetDayItem.Phase.UPCOMING)),
                WidgetStyleConfig.FinishedPolicy.SHOW_DIM);

        assertEquals(3, result.getRows().size());
        assertEquals("已上完", "A", result.getRows().get(0).getOccurrence().getId());
        assertEquals("SHOW_DIM 不折叠任何行", 0, result.getCollapsedFinishedCount());
    }

    @Test
    public void hideDropsFinishedRowsWithoutCollapsing() {
        WidgetDayListPolicy.Result result = WidgetDayListPolicy.apply(
                day(phase("A", WidgetDayItem.Phase.FINISHED), phase("B", WidgetDayItem.Phase.IN_PROGRESS),
                        phase("C", WidgetDayItem.Phase.UPCOMING)),
                WidgetStyleConfig.FinishedPolicy.HIDE);

        assertEquals(2, result.getRows().size());
        assertEquals("进行中的课必须留下（否则会退化成「要上课却显示不上课」）", "B", result.getRows().get(0).getOccurrence().getId());
        assertEquals(0, result.getCollapsedFinishedCount());
    }

    @Test
    public void collapseDropsFinishedRowsAndReportsTheirCount() {
        WidgetDayListPolicy.Result result = WidgetDayListPolicy.apply(
                day(phase("A", WidgetDayItem.Phase.FINISHED), phase("B", WidgetDayItem.Phase.FINISHED),
                        phase("C", WidgetDayItem.Phase.UPCOMING)),
                WidgetStyleConfig.FinishedPolicy.COLLAPSE);

        assertEquals(1, result.getRows().size());
        assertEquals("C", result.getRows().get(0).getOccurrence().getId());
        assertEquals("折叠计数必须等于被拿掉的行数", 2, result.getCollapsedFinishedCount());
    }

    @Test
    public void finishedCountIsZeroWhenNothingHasFinishedYet() {
        WidgetDayListPolicy.Result result = WidgetDayListPolicy.apply(
                day(phase("A", WidgetDayItem.Phase.UPCOMING), phase("B", WidgetDayItem.Phase.UPCOMING)),
                WidgetStyleConfig.FinishedPolicy.COLLAPSE);

        assertEquals(2, result.getRows().size());
        assertEquals("没有已上完的课时不应显示「已上完 0 节」", 0, result.getCollapsedFinishedCount());
    }

    @Test
    public void wholeDayFinishedKeepsRowsForShowDimAndEmptiesOthers() {
        List<WidgetDayItem> finished = day(phase("A", WidgetDayItem.Phase.FINISHED), phase("B", WidgetDayItem.Phase.FINISHED));

        assertEquals(2, WidgetDayListPolicy.apply(finished, WidgetStyleConfig.FinishedPolicy.SHOW_DIM).getRows().size());
        assertTrue(WidgetDayListPolicy.apply(finished, WidgetStyleConfig.FinishedPolicy.HIDE).getRows().isEmpty());
        assertEquals(2, WidgetDayListPolicy.apply(finished, WidgetStyleConfig.FinishedPolicy.COLLAPSE).getCollapsedFinishedCount());
    }

    @Test
    public void emptyAndNullInputsProduceAnEmptyResultInsteadOfCrashing() {
        assertTrue(WidgetDayListPolicy.apply(Collections.emptyList(), WidgetStyleConfig.FinishedPolicy.SHOW_DIM).getRows().isEmpty());
        assertTrue(WidgetDayListPolicy.apply(null, WidgetStyleConfig.FinishedPolicy.SHOW_DIM).getRows().isEmpty());
        assertEquals(0, WidgetDayListPolicy.apply(null, WidgetStyleConfig.FinishedPolicy.COLLAPSE).getCollapsedFinishedCount());
    }

    /** 策略缺失时按默认值处理，不能让一个空配置把整天的课都抹掉。 */
    @Test
    public void nullPolicyFallsBackToDefaultInsteadOfDroppingEverything() {
        WidgetDayListPolicy.Result result = WidgetDayListPolicy.apply(
                day(phase("A", WidgetDayItem.Phase.FINISHED), phase("B", WidgetDayItem.Phase.UPCOMING)), null);

        assertEquals(2, result.getRows().size());
        assertEquals(0, result.getCollapsedFinishedCount());
    }

    @Test
    public void rowsKeepChronologicalOrder() {
        WidgetDayListPolicy.Result result = WidgetDayListPolicy.apply(
                day(phase("A", WidgetDayItem.Phase.FINISHED), phase("B", WidgetDayItem.Phase.UPCOMING),
                        phase("C", WidgetDayItem.Phase.UPCOMING)),
                WidgetStyleConfig.FinishedPolicy.SHOW_DIM);

        List<String> ids = new ArrayList<>();
        for (WidgetDayItem item : result.getRows()) {
            ids.add(item.getOccurrence().getId());
        }
        assertEquals(Arrays.asList("A", "B", "C"), ids);
    }

    private static List<WidgetDayItem> day(WidgetDayItem... items) {
        return Arrays.asList(items);
    }

    private static WidgetDayItem phase(String id, WidgetDayItem.Phase phase) {
        WidgetOccurrence occurrence = new WidgetOccurrence(id, "课程" + id, "A101", "1-2", BASE, BASE + 3_600_000L, "10:00",
                "11:40", "2026-09-07", 0, "周一");
        return new WidgetDayItem(occurrence, phase);
    }
}
