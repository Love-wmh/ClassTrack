package com.classtrack.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * {@link WidgetDateLabel} 的测试：把 Web 预格式化的日期键拆成「M月D日」。
 *
 * <p>这是原生侧唯一接触「日期」的地方，因此必须证明它**只做字符串拆分**：没有时区、没有闰年、
 * 没有月末推演，脏数据一律退化成空串而不是猜一个日期。
 */
public class WidgetDateLabelTest {
    @Test
    public void padsAreDropped() {
        assertEquals("10月8日", WidgetDateLabel.monthDay("2026-10-08"));
        assertEquals("不补零的键也要能读", "1月8日", WidgetDateLabel.monthDay("2026-1-8"));
        assertEquals("12月31日", WidgetDateLabel.monthDay("2026-12-31"));
    }

    @Test
    public void dirtyInputDegradesToEmpty() {
        assertEquals("", WidgetDateLabel.monthDay(null));
        assertEquals("", WidgetDateLabel.monthDay(""));
        assertEquals("", WidgetDateLabel.monthDay("2026-10"));
        assertEquals("", WidgetDateLabel.monthDay("10-08"));
        assertEquals("", WidgetDateLabel.monthDay("2026-10-08-01"));
        assertEquals("", WidgetDateLabel.monthDay("not-a-date"));
        assertEquals("", WidgetDateLabel.monthDay("2026-ab-08"));
    }

    @Test
    public void outOfRangeNumbersAreRejected() {
        assertEquals("月份越界不能渲染成 13月1日", "", WidgetDateLabel.monthDay("2026-13-01"));
        assertEquals("", WidgetDateLabel.monthDay("2026-00-01"));
        assertEquals("", WidgetDateLabel.monthDay("2026-10-00"));
        assertEquals("", WidgetDateLabel.monthDay("2026-10-32"));
    }

    @Test
    public void weekdayIsAppendedWhenAvailable() {
        assertEquals("10月8日 周四", WidgetDateLabel.withWeekday("2026-10-08", "周四"));
    }

    @Test
    public void missingPartDoesNotProduceDanglingSpaces() {
        assertEquals("日期解析失败时只留星期", "周四", WidgetDateLabel.withWeekday(null, "周四"));
        assertEquals("星期缺失时只留日期", "10月8日", WidgetDateLabel.withWeekday("2026-10-08", null));
        assertEquals("", WidgetDateLabel.withWeekday(null, null));
        assertEquals("", WidgetDateLabel.withWeekday("bad", ""));
    }
}
