package com.classtrack.app;

/**
 * 桌面小工具在**某个真实格子尺寸**下要用的排版度量。
 *
 * <p>背景：这一版之前所有度量（字号、内边距、行距、列宽、圆角）都是写死的绝对值，格子被拉大后
 * 内容不跟着变，用户看到的是「字小 + 大片空白」，平板上最明显。这里把度量做成**尺寸的连续函数**，
 * 渲染层只负责把数值转成 `Dp`/`sp`。
 *
 * <p>三条必须保住的约束：
 *
 * <ol>
 *   <li>**下限锁死 1.0**：2×2 与手机 4×3 的输出与改动前逐值相同，「小格子不回归」由构造保证，
 *       不靠人眼比对；</li>
 *   <li>**取两个维度里更紧的那个**（`min`）：只要有一边还是手机尺寸就不放大，避免横长竖矮的格子上
 *       字号把行挤出卡片；</li>
 *   <li>**不许用尺寸档位或尺寸阈值**：没有 `SizeMode.Responsive` 那样的候选集合，也没有
 *       「高度小于 N 就不显示某区块」的分支 —— 放大只是算术，不是分支。</li>
 * </ol>
 *
 * <p>纯函数：不碰 Android，可被 JUnit 直接覆盖（见 {@code WidgetLayoutMetricsTest}）。
 */
public final class WidgetLayoutMetrics {

    /** 标定基准宽度：手机 4×3 实测（2026-09-20，`phase=widget_sized w=373 h=321`）。 */
    public static final float W_REF = 373f;

    /** 标定基准高度：手机 4×3 实测。 */
    public static final float H_REF = 321f;

    /** 缩放下限：现有绝对值就是小格子上验证过的答案，绝不缩小。 */
    public static final float MIN_SCALE = 1f;

    /** 缩放上限：防失控的常量，不是标定值（实测两个档位都没顶到它）。 */
    public static final float MAX_SCALE = 2f;

    /** 允许分两栏的最小宽度：再窄下去两栏各自都读不通。这是**布局可行性下限**，不是内容可见性阈值。 */
    private static final float DUAL_MIN_WIDTH_DP = 320f;

    /**
     * 允许分两栏的最小宽高比。
     *
     * <p>取 1.25 而不是 1.15 是实测定下来的：手机 4×3 的真实宽高比是 373/321 ≈ 1.162，用 1.15 会让
     * 手机默认格子也满足判据，「双栏只在宽格子上生效」这条就名存实亡了。1.25 把手机 4×3（1.162）挡在
     * 外面，同时平板 4×3（733/419 ≈ 1.75）与平板 6×4（≈1.97）都在里面。
     */
    private static final float DUAL_MIN_ASPECT = 1.25f;

    // 以下基准值就是改动前写死在 ClassTrackWidget.kt 里的常量，scale = 1 时必须逐值等于它们。
    private static final float BASE_TITLE_SP = 16f;
    private static final float BASE_BODY_SP = 13f;
    private static final float BASE_CAPTION_SP = 11f;
    private static final float BASE_HORIZONTAL_PADDING_DP = 14f;
    private static final float BASE_VERTICAL_PADDING_DP = 12f;
    private static final float BASE_CARD_RADIUS_DP = 20f;
    private static final float BASE_ROW_GAP_FIRST_DP = 6f;
    private static final float BASE_ROW_GAP_DP = 4f;
    private static final float BASE_HERO_GAP_DP = 6f;
    private static final float BASE_TIME_COLUMN_DP = 44f;
    private static final float BASE_MARKER_COLUMN_DP = 12f;
    private static final float BASE_STYLE_ENTRY_PADDING_DP = 8f;
    private static final float BASE_SECTIONS_COLUMN_DP = 38f;

    private final float scale;
    private final float padScale;
    private final boolean dualColumn;

    private WidgetLayoutMetrics(float scale, float padScale, boolean dualColumn) {
        this.scale = scale;
        this.padScale = padScale;
        this.dualColumn = dualColumn;
    }

    /**
     * 按真实格子尺寸算出这一套度量。
     *
     * @param widthDp 宿主格子的真实宽度（dp），来自 `LocalSize`。
     * @param heightDp 宿主格子的真实高度（dp）。
     * @return 度量集合；尺寸非法（非有限值或非正数）时退化为 scale = 1 的一套基准度量。
     */
    public static WidgetLayoutMetrics resolve(float widthDp, float heightDp) {
        if (!isUsable(widthDp) || !isUsable(heightDp)) {
            return new WidgetLayoutMetrics(MIN_SCALE, 1f, false);
        }
        // 两边比值取小的那个：纸面上限由更紧的那个维度决定。
        float raw = Math.min(widthDp / W_REF, heightDp / H_REF);
        float scale = Math.min(Math.max(raw, MIN_SCALE), MAX_SCALE);
        // 内边距与圆角比字号保守：大格子上不该被内边距吃掉内容区。
        float padScale = (float) Math.sqrt(scale);
        // 分栏要求：足够宽 + 够横。两个判据都是几何可行性下限，与设备类型无关。
        boolean dual = widthDp >= DUAL_MIN_WIDTH_DP && widthDp >= heightDp * DUAL_MIN_ASPECT;
        return new WidgetLayoutMetrics(scale, padScale, dual);
    }

    /**
     * @param value 待判定的尺寸。
     * @return 该尺寸是否可用于缩放计算。
     */
    private static boolean isUsable(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value) && value > 0f;
    }

    /** @return 统一缩放因子，恒在 [{@link #MIN_SCALE}, {@link #MAX_SCALE}] 内。 */
    public float getScale() {
        return scale;
    }

    /** @return 内边距与圆角的缩放因子（比 {@link #getScale()} 保守）。 */
    public float getPadScale() {
        return padScale;
    }

    /** @return hero 课名字号（sp）。 */
    public float getTitleSp() {
        return BASE_TITLE_SP * scale;
    }

    /** @return 正文字号（sp）。 */
    public float getBodySp() {
        return BASE_BODY_SP * scale;
    }

    /** @return 说明字号（sp）。 */
    public float getCaptionSp() {
        return BASE_CAPTION_SP * scale;
    }

    /** @return 卡片横向内边距（dp）。 */
    public float getHorizontalPaddingDp() {
        return BASE_HORIZONTAL_PADDING_DP * padScale;
    }

    /** @return 卡片纵向内边距（dp）。 */
    public float getVerticalPaddingDp() {
        return BASE_VERTICAL_PADDING_DP * padScale;
    }

    /** @return 卡片圆角（dp）。 */
    public float getCardRadiusDp() {
        return BASE_CARD_RADIUS_DP * padScale;
    }

    /** @return 首行课程与汇总行之间的行距（dp）。 */
    public float getRowGapFirstDp() {
        return BASE_ROW_GAP_FIRST_DP * scale;
    }

    /** @return 其余行之间的行距（dp）。 */
    public float getRowGapDp() {
        return BASE_ROW_GAP_DP * scale;
    }

    /** @return hero 区块与下方课表之间的间距（dp）。 */
    public float getHeroGapDp() {
        return BASE_HERO_GAP_DP * scale;
    }

    /** @return 课程行的时间列宽（dp）。 */
    public float getTimeColumnDp() {
        return BASE_TIME_COLUMN_DP * scale;
    }

    /** @return 「正在上」标记列宽（dp）。 */
    public float getMarkerColumnDp() {
        return BASE_MARKER_COLUMN_DP * scale;
    }

    /** @return 「样式」入口的左内边距（dp）。 */
    public float getStyleEntryPaddingDp() {
        return BASE_STYLE_ENTRY_PADDING_DP * padScale;
    }

    /**
     * @return 「信息加密」时节次列的宽度（dp）；不加密时这一列不参与布局。
     */
    public float getSectionsColumnDp() {
        return BASE_SECTIONS_COLUMN_DP * scale;
    }

    /**
     * @return 当前尺寸是否支持把正文分两栏。只有用户显式选了「双栏」时渲染层才会参考它；
     *     不满足时保持单栏（配置页对此有如实说明）。
     */
    public boolean isDualColumn() {
        return dualColumn;
    }
}
