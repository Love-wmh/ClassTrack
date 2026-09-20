package com.classtrack.app;

/**
 * 正文里的一行（判决结果，不含任何排版数值）。
 *
 * <p>把正文表达成「行的序列」，是为了让真实渲染与配置页预览共用同一份顺序与同一个渲染函数：
 * 两侧唯一的差别只是把序列装进 `LazyColumn` 还是普通 `Column`，因此预览不可能与桌面漂移。
 *
 * <p>本类从渲染层（原 `ClassTrackWidget.kt` 里的私有 sealed interface）下沉到纯 Java，原因是
 * 「显示哪些行」的判决以前完全没有单测覆盖，而上一轮的真机缺陷（4×2 只剩 hero、下面全白）
 * 正是这一类判决出错。下沉后由 {@link WidgetLinePolicy} 产出、由 {@code WidgetLinePolicyTest} 钉住。
 *
 * <p>「信息加密」追加的内容不在这里做判断，而是作为行上的 flag 由 {@link WidgetLinePolicy} 填好，
 * 渲染层只按 flag 画。
 */
public final class WidgetBodyLine {

    /** 行的种类；真实渲染与配置页预览都按它分派。 */
    public enum Kind {
        /** hero：状态标签 +「样式」入口 + 课程名 + 时间与教室。 */
        HERO,
        /** 汇总行：「今天 周一 · 共 3 节」+「样式」入口；今天没课时这一行就是「今天无课」。 */
        SUMMARY,
        /** 「紧凑」样式底部的计数行。 */
        COUNTER,
        /** 「已上完 N 节」。 */
        COLLAPSED,
        /** 「下一节 · 10月8日 周四 08:00 高等数学」。 */
        NEXT_OTHER,
        /** 一行课程。 */
        COURSE,
        /** 双栏富内容：汇总行下面那行「已上完 1 节 · 还有 2 节」。 */
        SUMMARY_COUNTS,
        /** 双栏富内容：左卡中缝的「下一节 16:00 线性代数 D402」+「第 1 周 / 共 20 周」。 */
        MID_NEXT,
        /** 双栏富内容：列表底部的「今天最后一节 19:00 数据结构 A101」。 */
        FOOTER_LAST
    }

    private final Kind kind;
    private final WidgetDayItem item;
    private final int index;
    private final int titleMaxLines;
    private final boolean showCounts;
    private final boolean showSections;

    private WidgetBodyLine(Kind kind, WidgetDayItem item, int index, int titleMaxLines,
            boolean showCounts, boolean showSections) {
        this.kind = kind;
        this.item = item;
        this.index = index;
        this.titleMaxLines = titleMaxLines;
        this.showCounts = showCounts;
        this.showSections = showSections;
    }

    /**
     * @param titleMaxLines hero 课名允许的行数；1 为默认，「信息加密」时放宽到 2。
     * @return hero 行。
     */
    public static WidgetBodyLine hero(int titleMaxLines) {
        return new WidgetBodyLine(Kind.HERO, null, 0, Math.max(1, titleMaxLines), false, false);
    }

    /**
     * @param showCounts 「信息加密」时为 `true`，渲染层在汇总文案后追加当天计数。
     * @return 汇总行。
     */
    public static WidgetBodyLine summary(boolean showCounts) {
        return new WidgetBodyLine(Kind.SUMMARY, null, 0, 1, showCounts, false);
    }

    /** @return 「紧凑」样式的计数行。 */
    public static WidgetBodyLine counter() {
        return new WidgetBodyLine(Kind.COUNTER, null, 0, 1, false, false);
    }

    /** @return 「已上完 N 节」折叠行。 */
    public static WidgetBodyLine collapsed() {
        return new WidgetBodyLine(Kind.COLLAPSED, null, 0, 1, false, false);
    }

    /** @return 「下一节 · 某日 某时刻 某课」行。 */
    public static WidgetBodyLine nextOther() {
        return new WidgetBodyLine(Kind.NEXT_OTHER, null, 0, 1, false, false);
    }

    /**
     * @param item 这一节课。
     * @param index 在行序列里的下标；首行（0）会多留一点与汇总行之间的间距。
     * @param showSections 「信息加密」时为 `true`，渲染层在时间后补节次。
     * @return 一行课程。
     */
    /** @return 双栏富内容：汇总行下面的当天计数行。 */
    public static WidgetBodyLine summaryCounts() {
        return new WidgetBodyLine(Kind.SUMMARY_COUNTS, null, 0, 1, true, false);
    }

    /** @return 双栏富内容：左卡中缝的「下一节」行。 */
    public static WidgetBodyLine midNext() {
        return new WidgetBodyLine(Kind.MID_NEXT, null, 0, 1, false, false);
    }

    /** @return 双栏富内容：列表底部的「今天最后一节」行。 */
    public static WidgetBodyLine footerLast() {
        return new WidgetBodyLine(Kind.FOOTER_LAST, null, 0, 1, false, false);
    }

    /**
     * @param item 这一节课。
     * @param index 在行序列里的下标；首行（0）会多留一点与汇总行之间的间距。
     * @param showSections 「信息加密」时为 `true`，渲染层在时间后补节次。
     * @return 一行课程。
     */
    public static WidgetBodyLine course(WidgetDayItem item, int index, boolean showSections) {
        return new WidgetBodyLine(Kind.COURSE, item, index, 1, false, showSections);
    }

    public Kind getKind() {
        return kind;
    }

    /** @return 该行对应的课程；仅 {@link Kind#COURSE} 非 `null`。 */
    public WidgetDayItem getItem() {
        return item;
    }

    /** @return 该行在序列里的下标；仅 {@link Kind#COURSE} 有意义。 */
    public int getIndex() {
        return index;
    }

    /** @return hero 课名允许的行数（1 或 2）。 */
    public int getTitleMaxLines() {
        return titleMaxLines;
    }

    /** @return 汇总行是否要追加当天计数（「已上完 N 节」）。 */
    public boolean isShowCounts() {
        return showCounts;
    }

    /** @return 课程行是否要补节次（「第 3-4 节」）。 */
    public boolean isShowSections() {
        return showSections;
    }
}
