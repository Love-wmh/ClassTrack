package com.classtrack.app;

/**
 * 把 Web 预格式化的本地日期键（`YYYY-MM-DD`）转成中文「M月D日」。
 *
 * <p>为什么可以在原生侧做：`dayKey` 已经是 Web 按设备本地时区算好的日期键，这里只做
 * **字符串拆分与整数拼接**，不做时区、闰年、月末等任何日期运算，因此不会引入「原生算错日期」
 * 这类风险 —— 需要真正做日期推理的地方（今天是第几天、下一节课在哪天）依然只靠快照里的
 * epoch 与 `dayOffset` 下标判定。
 *
 * <p>之所以需要它：长假（例如国庆）期间下一节课可能在好几天之后，只写「周一 08:00」不足以
 * 说明那不是今天的课，带上「10月8日」才能让用户一眼看出是未来的某一天。
 */
public final class WidgetDateLabel {
    private WidgetDateLabel() {}

    /**
     * 取「月日」文案。
     *
     * @param dayKey 形如 `2026-10-08` 的本地日期键；允许 `2026-1-8` 这种不补零写法。
     * @return 形如 `10月8日`；为 `null`、空串或格式不符时返回空串，调用方据此退化为不显示日期。
     */
    public static String monthDay(String dayKey) {
        if (dayKey == null || dayKey.isEmpty()) return "";

        String[] parts = dayKey.split("-");
        if (parts.length != 3) return "";

        int month;
        int day;
        try {
            month = Integer.parseInt(parts[1]);
            day = Integer.parseInt(parts[2]);
        } catch (NumberFormatException error) {
            return "";
        }

        // 范围校验只是为了让脏数据退化为「不显示日期」，不做日历合法性推演（例如 2 月 30 日）。
        if (month < 1 || month > 12 || day < 1 || day > 31) return "";

        return month + "月" + day + "日";
    }

    /**
     * 组合「日期 + 星期」文案。
     *
     * <p>日期解析失败时只留星期，避免出现「10月0日 周一」或多余空格。
     *
     * @param dayKey 本地日期键。
     * @param weekdayLabel 星期文案，如 `周一`；可为空。
     * @return 形如 `10月8日 周一`；两者都取不到时返回空串。
     */
    public static String withWeekday(String dayKey, String weekdayLabel) {
        String monthDay = monthDay(dayKey);
        String weekday = weekdayLabel == null ? "" : weekdayLabel;

        if (monthDay.isEmpty()) return weekday;
        if (weekday.isEmpty()) return monthDay;
        return monthDay + " " + weekday;
    }
}
