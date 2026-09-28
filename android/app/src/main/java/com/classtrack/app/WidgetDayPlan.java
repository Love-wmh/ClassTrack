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
 *   <li>今天还有**没上完**的课（正在上，或还没开始）→ 列今天；</li>
 *   <li>今天已经没有没上完的课（今天本来没课，或今天的课都上完了 —— 三种「已上完」策略都算），且
 *       **明天有课** → 列明天的课，并且汇总行必须写明「明天」，不能冒充今天；</li>
 *   <li>明天也没课（周末 / 长假 / 学期尾声）→ 一行课表都不列，只由 hero 的空课态与「下次上课」块说明。
 *       否则用户在长假里会一直看到课表，误以为第二天要上课（用户 2026-09-20 明确否掉「下一个有课的日子」）。</li>
 * </ol>
 *
 * <p>「今天的课已上完」为什么也列明天（2026-09-28 用户口径）：hero 从 2026-09-23 起在这两种情况下
 * 都画「今天已无课」的空课态，于是卡上再也没有任何课程信息 —— 只剩一行「下一节 · …」被用户明确否掉。
 * 今天原本有课时 {@link #isTodayHadClasses()} 仍然为 `true`，空课态的醒目行因此照样写「今天已无课」。
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
        // 裁剪只对「今天」生效：它决定今天这一天的行里哪些能被画出来。
        WidgetDayListPolicy.Result clipped = WidgetDayListPolicy.apply(today, policy);
        boolean todayHadClasses = !today.isEmpty();

        if (hasUnfinishedRow(clipped.getRows())) {
            return new WidgetDayPlan(Source.TODAY, clipped.getRows(), clipped.getCollapsedFinishedCount(),
                    weekdayOf(today), true);
        }

        // 今天已经没有「还没上」的课：今天本来没课，或今天的课都上完了。明天有课就列明天 ——
        // 汇总行必须写明「明天」，而 hero 的空课态说的是今天（`todayHadClasses` 仍然是上面那个值）。
        List<WidgetDayItem> tomorrow = nextDayItems == null ? Collections.<WidgetDayItem>emptyList() : nextDayItems;
        if (!tomorrow.isEmpty()) {
            // 折叠计数跟着一起走：那是用户显式选的策略，不该因为列表切到明天就消失。
            return new WidgetDayPlan(Source.TOMORROW, tomorrow, clipped.getCollapsedFinishedCount(),
                    weekdayOf(tomorrow), todayHadClasses);
        }

        // 明天也没课（周末 / 长假 / 学期尾声）：一行课表都不列，只给 hero 空课态与「下次上课」块。
        // 不回退到「下一个有课的日子」—— 那是用户在 2026-09-20 明确否掉的口径。
        return new WidgetDayPlan(Source.NONE, Collections.<WidgetDayItem>emptyList(),
                clipped.getCollapsedFinishedCount(), todayHadClasses ? weekdayOf(today) : "", todayHadClasses);
    }

    /**
     * 裁剪后的行里还有没有「还没上完」的课。
     *
     * <p>判据是「存在一条 {@link WidgetDayItem.Phase#FINISHED} 以外的行」，而不是「行列表非空」：
     * 「显示已上完」策略下今天只剩灰课，此时今天同样已经没有可上的课了。
     *
     * @param rows 按策略裁剪后的当天行。
     * @return 是否还有可上的课。
     */
    private static boolean hasUnfinishedRow(List<WidgetDayItem> rows) {
        for (WidgetDayItem row : rows) {
            if (row.getPhase() != WidgetDayItem.Phase.FINISHED) return true;
        }
        return false;
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
