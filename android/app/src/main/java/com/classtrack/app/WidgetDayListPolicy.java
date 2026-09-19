package com.classtrack.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 把「今天一整天的课」按用户选定的策略裁剪成要渲染的行。
 *
 * <p>纯函数：输入是已经带好 {@link WidgetDayItem.Phase} 的行与配置，输出是渲染指令。
 * 放在 Java 侧而不是渲染层，是为了让三种策略都能被 JUnit 覆盖，而不是靠看截图判断对错。
 */
public final class WidgetDayListPolicy {
    /** 裁剪结果。 */
    public static final class Result {
        private final List<WidgetDayItem> rows;
        private final int collapsedFinishedCount;

        Result(List<WidgetDayItem> rows, int collapsedFinishedCount) {
            this.rows = Collections.unmodifiableList(new ArrayList<>(rows));
            this.collapsedFinishedCount = collapsedFinishedCount;
        }

        /** @return 需要渲染的行，保持时间顺序。 */
        public List<WidgetDayItem> getRows() {
            return rows;
        }

        /**
         * @return 被折叠掉的已上完节数；只有 {@link WidgetStyleConfig.FinishedPolicy#COLLAPSE} 下非 0。
         */
        public int getCollapsedFinishedCount() {
            return collapsedFinishedCount;
        }
    }

    private WidgetDayListPolicy() {}

    /**
     * 按策略裁剪今日课表。
     *
     * @param items 今日全部课程（含已上完），按时间升序。
     * @param policy 已上完的课的处理方式。
     * @return 裁剪结果。
     */
    public static Result apply(List<WidgetDayItem> items, WidgetStyleConfig.FinishedPolicy policy) {
        if (items == null || items.isEmpty()) return new Result(Collections.emptyList(), 0);

        // 配置缺失时按默认策略处理：一个空配置不该把整天的课都抹掉。
        WidgetStyleConfig.FinishedPolicy effective = policy == null ? WidgetStyleConfig.DEFAULT_FINISHED_POLICY : policy;
        boolean showDim = effective == WidgetStyleConfig.FinishedPolicy.SHOW_DIM;
        List<WidgetDayItem> rows = new ArrayList<>();
        int finishedCount = 0;

        for (WidgetDayItem item : items) {
            if (item.isFinished()) {
                finishedCount++;
                if (showDim) rows.add(item);
                continue;
            }
            rows.add(item);
        }

        int collapsed = effective == WidgetStyleConfig.FinishedPolicy.COLLAPSE ? finishedCount : 0;
        return new Result(rows, collapsed);
    }
}
