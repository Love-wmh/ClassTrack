package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * {@link WidgetLayoutMetrics} 的度量模型测试。
 *
 * <p>这一层是「小格子不回归」与「大格子真的变大」两个要求的唯一实现处，因此四件事必须钉死：
 * 下限锁定、取两维中更紧的那个、上限封顶、双栏判据的两侧。基准尺寸取自 2026-09-20 的真机实测
 * （手机 4×3 = 373×321dp，平板 4×3 = 733×419dp，手机最小 2×2 = 179×210dp）。
 */
public class WidgetLayoutMetricsTest {

    /** 度量浮点比较的容差；比例运算不追求逐位相等。 */
    private static final float EPSILON = 0.0001f;

    /** 2×2（iPhone 下限）与 4×3（放置默认）必须与改动前的写死常量逐值相同。 */
    @Test
    public void smallCellsKeepEveryMetricExactlyAsBefore() {
        for (float[] size : new float[][] {{179f, 210f}, {276f, 210f}, {373f, 321f}, {250f, 180f}}) {
            WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(size[0], size[1]);

            assertEquals("scale 必须锁在下限：" + size[0] + "x" + size[1], WidgetLayoutMetrics.MIN_SCALE, metrics.getScale(), EPSILON);
            assertEquals(1f, metrics.getPadScale(), EPSILON);
            assertEquals(16f, metrics.getTitleSp(), EPSILON);
            assertEquals(13f, metrics.getBodySp(), EPSILON);
            assertEquals(11f, metrics.getCaptionSp(), EPSILON);
            assertEquals(14f, metrics.getHorizontalPaddingDp(), EPSILON);
            assertEquals(12f, metrics.getVerticalPaddingDp(), EPSILON);
            assertEquals(20f, metrics.getCardRadiusDp(), EPSILON);
            assertEquals(6f, metrics.getRowGapFirstDp(), EPSILON);
            assertEquals(4f, metrics.getRowGapDp(), EPSILON);
            assertEquals(6f, metrics.getHeroGapDp(), EPSILON);
            assertEquals(44f, metrics.getTimeColumnDp(), EPSILON);
            assertEquals(12f, metrics.getMarkerColumnDp(), EPSILON);
            assertEquals(8f, metrics.getStyleEntryPaddingDp(), EPSILON);
        }
    }

    /** 平板 4×3 实测 733×419dp：应当按更紧的高度放大到约 1.31 倍。 */
    @Test
    public void tabletCellScalesUpByTheTighterDimension() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(733f, 419f);

        assertEquals(1.305f, metrics.getScale(), 0.01f);
        assertTrue("字号确实变大了", metrics.getBodySp() > 13f);
        assertTrue("内边距也随之变大", metrics.getHorizontalPaddingDp() > 14f);
        assertEquals("内边距用 sqrt(scale)，比字号保守", (float) Math.sqrt(metrics.getScale()), metrics.getPadScale(), EPSILON);
    }

    /** 只要有一个维度还是小尺寸，就不放大 —— 这是「取 min」的意义。 */
    @Test
    public void aSingleSmallDimensionKeepsTheWholeCardAtBaseline() {
        assertEquals(WidgetLayoutMetrics.MIN_SCALE, WidgetLayoutMetrics.resolve(1000f, 321f).getScale(), EPSILON);
        assertEquals(WidgetLayoutMetrics.MIN_SCALE, WidgetLayoutMetrics.resolve(373f, 900f).getScale(), EPSILON);
    }

    @Test
    public void scaleIsMonotonicInBothDimensions() {
        float base = WidgetLayoutMetrics.resolve(373f, 321f).getScale();
        float wider = WidgetLayoutMetrics.resolve(560f, 321f).getScale();
        float taller = WidgetLayoutMetrics.resolve(373f, 480f).getScale();
        float both = WidgetLayoutMetrics.resolve(600f, 520f).getScale();

        assertTrue("变宽不该变小", wider >= base);
        assertTrue("变高不该变小", taller >= base);
        assertEquals("只有一边变大时仍受另一边约束", base, wider, EPSILON);
        assertEquals("只有一边变大时仍受另一边约束", base, taller, EPSILON);
        assertTrue("两边都变大才真的放大", both > base);
    }

    @Test
    public void scaleIsCappedAtTheCalibrationCeiling() {
        WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(4000f, 4000f);

        assertEquals(WidgetLayoutMetrics.MAX_SCALE, metrics.getScale(), EPSILON);
        assertEquals(16f * WidgetLayoutMetrics.MAX_SCALE, metrics.getTitleSp(), EPSILON);
    }

    /** 非法尺寸不能让小工具崩掉或算出 0 号字：退化为基准度量。 */
    @Test
    public void unusableSizesFallBackToBaselineMetrics() {
        for (float[] size : new float[][] {{0f, 0f}, {-1f, 300f}, {Float.NaN, 300f}, {300f, Float.POSITIVE_INFINITY}}) {
            WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(size[0], size[1]);

            assertEquals(WidgetLayoutMetrics.MIN_SCALE, metrics.getScale(), EPSILON);
            assertEquals(13f, metrics.getBodySp(), EPSILON);
            assertFalse(metrics.isDualColumn());
        }
    }

    /** 缩放算出来的 5.24dp / 20.96sp 在视觉上是脏的：所有输出都必须落在网格上。 */
    @Test
    public void everyMetricFallsOnAGrid() {
        float[][] sizes = {{179f, 210f}, {373f, 321f}, {733f, 419f}, {1100f, 700f}, {600f, 520f}};
        for (float[] size : sizes) {
            WidgetLayoutMetrics metrics = WidgetLayoutMetrics.resolve(size[0], size[1]);
            for (float sp : new float[] {metrics.getTitleSp(), metrics.getBodySp(), metrics.getCaptionSp()}) {
                assertEquals("字号必须落在 0.5sp 上：" + sp, 0f, Math.abs(sp * 2f - Math.round(sp * 2f)), EPSILON);
            }
            for (float dp : new float[] {metrics.getHorizontalPaddingDp(), metrics.getVerticalPaddingDp(),
                    metrics.getCardRadiusDp(), metrics.getRowGapDp(), metrics.getRowGapFirstDp(),
                    metrics.getHeroGapDp(), metrics.getTimeColumnDp(), metrics.getMarkerColumnDp(),
                    metrics.getSectionsColumnDp(), metrics.getStyleEntryPaddingDp(), metrics.getHeroInnerPaddingDp(),
                    metrics.getDualGapDp()}) {
                assertEquals("间距必须落在 1dp 上：" + dp, 0f, Math.abs(dp - Math.round(dp)), EPSILON);
            }
        }
    }

    /** 双栏左栏宽度必须落在「读得通」的舒适区间里，而不是卡片宽度的固定百分比。 */
    @Test
    public void dualHeaderKeepsAComfortableWidth() {
        assertEquals(252f, WidgetLayoutMetrics.resolve(733f, 419f).getDualHeaderWidthDp(), 2f);
        assertEquals("极窄的双栏卡片保底 220dp", 220f, WidgetLayoutMetrics.resolve(534f, 315f).getDualHeaderWidthDp(), EPSILON);
        assertEquals("极宽的卡片上限 360dp", 360f, WidgetLayoutMetrics.resolve(2000f, 900f).getDualHeaderWidthDp(), EPSILON);
    }

    /** 双栏左卡的内部留白随尺寸放大，但尺度保守（大格子上不该被内边距吃掉内容区）。 */
    @Test
    public void dualCardKeepsInnerPaddingConservative() {
        assertEquals(14f, WidgetLayoutMetrics.resolve(373f, 321f).getHeroInnerPaddingDp(), EPSILON);
        assertEquals(16f, WidgetLayoutMetrics.resolve(733f, 419f).getHeroInnerPaddingDp(), EPSILON);
        assertEquals(12f, WidgetLayoutMetrics.resolve(373f, 321f).getDualGapDp(), 1f);
        assertEquals(14f, WidgetLayoutMetrics.resolve(733f, 419f).getDualGapDp(), 1f);
    }

    /** 分栏判据的两侧：宽度下限与宽高比下限各测一次。 */
    @Test
    public void dualColumnRequiresBothWidthAndAspectRatio() {
        assertTrue("手机 6×3（宽矮）满足几何判据", WidgetLayoutMetrics.resolve(534f, 315f).isDualColumn());
        assertTrue("平板 4×3 满足", WidgetLayoutMetrics.resolve(733f, 419f).isDualColumn());
        assertFalse("手机 4×3 不够横（真实宽高比 1.162 < 1.25）", WidgetLayoutMetrics.resolve(373f, 321f).isDualColumn());

        assertTrue("正好 320dp 宽且够横", WidgetLayoutMetrics.resolve(320f, 200f).isDualColumn());
        assertFalse("差 1dp 就不分栏", WidgetLayoutMetrics.resolve(319f, 200f).isDualColumn());
        assertTrue("正好 1.25 的宽高比", WidgetLayoutMetrics.resolve(500f, 400f).isDualColumn());
        assertFalse("宽高比不足不分栏", WidgetLayoutMetrics.resolve(499f, 400f).isDualColumn());
        assertFalse("又高又瘦不分栏", WidgetLayoutMetrics.resolve(400f, 500f).isDualColumn());
    }
}
