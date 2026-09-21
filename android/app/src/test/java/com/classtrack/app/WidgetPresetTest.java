package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 预设表的解析、标识与「尺寸 → 预设」的匹配。
 *
 * <p>守住四件事：
 *
 * <ol>
 *   <li>Web 侧传来的标识**只认白名单**（脏值绝不能变成一次写入）；</li>
 *   <li>每档的「样式 + 大格子表现 + 格子数」是固定的（配置页预填、pin 尺寸提示、provider 默认样式都读它）；</li>
 *   <li>标识与格子数**一一对应**（`cell_4x3` 必须是 4×3）；</li>
 *   <li>{@link WidgetPreset#match} 的最近邻裁决可预测（含并列与非法输入）。</li>
 * </ol>
 */
public class WidgetPresetTest {

    @Test
    public void knownIdsMapToTheirBundle() {
        WidgetPreset minimal = WidgetPreset.parse("cell_2x2");
        assertNotNull(minimal);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, minimal.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, minimal.getWideLayout());
        assertEquals("2×2", minimal.getCellLabel());

        WidgetPreset phone = WidgetPreset.parse("cell_2x3");
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, phone.getLayoutStyle());
        assertEquals("2×3", phone.getCellLabel());

        WidgetPreset wide = WidgetPreset.parse("cell_4x2");
        assertEquals("4×2", wide.getCellLabel());

        // 4×3 是唯一具备「双栏能力」的一档：几何不允许时渲染侧自动退单栏（手机 4×3 就是这种）。
        WidgetPreset standard = WidgetPreset.parse("cell_4x3");
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, standard.getWideLayout());
        assertEquals("4×3", standard.getCellLabel());

        WidgetPreset widest = WidgetPreset.parse("cell_6x3");
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, widest.getWideLayout());
        assertEquals("6×3", widest.getCellLabel());
    }

    /** 标识与格子数必须一致：`cell_WxH` 里的数字是匹配规则与 provider 注册表的共同依据。 */
    @Test
    public void idsAgreeWithTheirCellCounts() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            assertEquals(preset.getId(), "cell_" + preset.getCellWidth() + "x" + preset.getCellHeight());
            assertEquals(preset.getCellLabel(), preset.getCellWidth() + "×" + preset.getCellHeight());
        }
        assertEquals(5, WidgetPreset.all().size());
    }

    /** 每个预设至少要有一个标定样本，且样本是正数（匹配规则靠它算距离）。 */
    @Test
    public void everyPresetHasUsableCalibrationSamples() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            assertTrue(preset.getId(), preset.getSamples().size() >= 1);
            assertTrue(preset.getId(), preset.getWidthDp() > 0f);
            assertTrue(preset.getId(), preset.getHeightDp() > 0f);
        }
    }

    /** 大小写与空白不该让预设失效：Web 侧只是一个字符串参数，容错比严格更实用。 */
    @Test
    public void parsingIsTolerantButStillWhitelisted() {
        assertEquals(WidgetPreset.ID_CELL_4X3, WidgetPreset.parse("  CELL_4X3 ").getId());
        assertEquals(WidgetPreset.ID_CELL_4X2, WidgetPreset.parse("Cell_4x2").getId());
    }

    /** 未知/空/非法输入一律返回 null，由调用方走「未选预设」的默认行为。 */
    @Test
    public void unknownInputsFallBackToNoPreset() {
        assertNull(WidgetPreset.parse(null));
        assertNull(WidgetPreset.parse(""));
        assertNull(WidgetPreset.parse("   "));
        assertNull(WidgetPreset.parse("cell_6x6"));
        // 旧标识已经不在白名单里（按尺寸重命名），传入时必须回退而不是崩。
        assertNull(WidgetPreset.parse("tablet_dual"));
        assertNull(WidgetPreset.parse("'; DROP TABLE presets; --"));
    }

    /** 各档的实测尺寸必须就近命中自己：这是"尺寸变化自动匹配"的基准。 */
    @Test
    public void calibrationSamplesMatchTheirOwnPreset() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            for (WidgetPreset.Sample sample : preset.getSamples()) {
                assertEquals(preset.getId(), WidgetPreset.match(sample.widthDp, sample.heightDp).getId());
            }
        }
    }

    /** 非法尺寸不崩：按最小档处理（面板刚打开、尺寸还没测量到时会走到这里）。 */
    @Test
    public void invalidSizesFallBackToTheSmallestPreset() {
        assertEquals(WidgetPreset.ID_CELL_2X2, WidgetPreset.match(0f, 0f).getId());
        assertEquals(WidgetPreset.ID_CELL_2X2, WidgetPreset.match(-1f, 200f).getId());
    }

    @Test
    public void clearNullsWinOverEveryOtherPreset() {
        // 2×3 与 4×3 的距离比看起来更近：两者高度相同量级，宽度只差一格。必须选对，否则手机上会莫名双栏。
        assertEquals(WidgetPreset.ID_CELL_2X3, WidgetPreset.match(179f, 315f).getId());
        assertEquals(WidgetPreset.ID_CELL_4X3, WidgetPreset.match(373f, 321f).getId());
        assertEquals(WidgetPreset.ID_CELL_4X3, WidgetPreset.match(733f, 419f).getId());
        assertEquals(WidgetPreset.ID_CELL_6X3, WidgetPreset.match(1142f, 419f).getId());
    }

    /** 极端尺寸也要落在最接近的一档（6×6 比 6×3 更"高"，仍应落到最大的那档）。 */
    @Test
    public void extremeSizesStillResolveToTheNearestPreset() {
        assertEquals(WidgetPreset.ID_CELL_6X3, WidgetPreset.match(1142f, 900f).getId());
        assertEquals(WidgetPreset.ID_CELL_2X2, WidgetPreset.match(120f, 120f).getId());
    }
}
