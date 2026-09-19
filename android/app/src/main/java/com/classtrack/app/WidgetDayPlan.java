package com.classtrack.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 「这一次该渲染哪一天的课表」的裁决结果。
 *
 * <p>规则由用户在 2026-09-20 真机回测时明确（原文：「仅在明天有课时提示，不能我放一个长假比如
 * 国庆，还有好几天，但是一直提示有课」）：
 *
 * <ol>
 *   <li>今天有课可列 → 列今天；</li>
 *   <li>今天真的没课、且**明天有课** → 列明天的课，并且汇总行必须写明「明天」，不能冒充今天；</li>
 *   <li>今天与明天都没课（长假）→ 一行课表都不列，只给「下一节 · 10月8日 周四 08:00」这类提示。
 *       否则用户在长假里会一直看到课表，误以为第二天要上课。</li>
 * </ol>
 *
 * <p>另一种「没有行可列」的情况是：今天本来有课，但用户选了「不显示已上完的课」且这些课都已上完。
 * 这时**不回退**到明天 —— 用户刚刚表达了「不想看已上完的课」，把明天的课塞进来会被误读成今天的课。
 *
 * <p>纯函数：只做列表遍历与调用 {@link WidgetDayListPolicy}，不碰时间、不碰 Android。
 */
public final class WidgetDayPlan {

    /** 要渲染的课表属于哪一天。 */
    public enum Source {
        /** 今天。 */
        TODAY,
        /** 明天 —— 渲染层必须明确标注，不能写成「今天」。 */
        TOMORROW,
        /** 不渲染任何课程行。 */
        NONE
    }

    private final Source source;
    private final List<WidgetDayItem> rows;
    private final int collapsedFinishedCount;
    private final String weekdayLabel;
    private final boolean todayHadClasses;

    private WidgetDayPlan(Source source, List<WidgetDayItem> rows, int collapsedFinishedCount,
            String weekdayLabel, boolean todayHadClasses) {
        this.source = source;
        this.rows = Collections.unmodifiableList(new ArrayList<>(rows));
        this.collapsedFinishedCount = collapsedFinishedCount;
        this.weekdayLabel = weekdayLabel;
        this.todayHadClasses = todayHadClasses;
    }

    /**
     * 裁决本次渲染要列哪一天的课。
     *
     * @param todayItems 今天一整天的课（含已上完），允许为 `null` 或空。
     * @param nextDayItems 明天的课（时刻上必然都还没开始），允许为 `null` 或空。
     * @param policy 已上完的课的处理方式，只对「今天」生效。
     * @return 裁决结果，永不返回 `null`。
     */
    public static WidgetDayPlan resolve(List<WidgetDayItem> todayItems, List<WidgetDayItem> nextDayItems,
            WidgetStyleConfig.FinishedPolicy policy) {
        List<WidgetDayItem> today = todayItems == null ? Collections.<WidgetDayItem>emptyList() : todayItems;

        if (!today.isEmpty()) {
            WidgetDayListPolicy.Result clipped = WidgetDayListPolicy.apply(today, policy);
            if (!clipped.getRows().isEmpty()) {
                return new WidgetDayPlan(Source.TODAY, clipped.getRows(), clipped.getCollapsedFinishedCount(),
                        weekdayOf(today), true);
            }
            // 今天有课、但被「不显示已上完」全部裁掉：不回退到明天，只如实说「今天已无课」。
            return new WidgetDayPlan(Source.NONE, Collections.<WidgetDayItem>emptyList(),
                    clipped.getCollapsedFinishedCount(), weekdayOf(today), true);
        }

        List<WidgetDayItem> tomorrow = nextDayItems == null ? Collections.<WidgetDayItem>emptyList() : nextDayItems;
        if (!tomorrow.isEmpty()) {
            return new WidgetDayPlan(Source.TOMORROW, tomorrow, 0, weekdayOf(tomorrow), false);
        }

        return new WidgetDayPlan(Source.NONE, Collections.<WidgetDayItem>emptyList(), 0, "", false);
    }

    /**
     * 取某一天第一节课的星期文案。
     *
     * @param items 该天的课，允许为空。
     * @return 星期文案；取不到时返回空串。
     */
    private static String weekdayOf(List<WidgetDayItem> items) {
        if (items.isEmpty()) return "";
        String label = items.get(0).getOccurrence().getWeekdayLabel();
        return label == null ? "" : label;
    }

    /** @return 要渲染的课表属于哪一天。 */
    public Source getSource() {
        return source;
    }

    /** @return 需要渲染的课程行；{@link Source#NONE} 时为空列表。 */
    public List<WidgetDayItem> getRows() {
        return rows;
    }

    /** @return 被折叠掉的已上完节数；仅在今天取 {@link WidgetStyleConfig.FinishedPolicy#COLLAPSE} 时非 0。 */
    public int getCollapsedFinishedCount() {
        return collapsedFinishedCount;
    }

    /**
     * @return 课表所属那一天的星期文案（如 `周三`）；{@link Source#NONE} 或取不到时为空串。
     */
    public String getWeekdayLabel() {
        return weekdayLabel;
    }

    /**
     * 今天原本有没有课。
     *
     * <p>用来区分「今天本来就没课」（周末）与「今天的课上完了」（选「不显示已上完」）。两者都渲染
     * 成空列表，但文案不同：前者「今天无课」，后者「今天已无课」。
     *
     * @return 今天是否有过课。
     */
    public boolean isTodayHadClasses() {
        return todayHadClasses;
    }

    /** @return 是否有课程行要渲染。 */
    public boolean hasRows() {
        return !rows.isEmpty();
    }
}
