package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 预设表的解析、标识与每档的固定搭配。
 *
 * <p>守住三件事：
 *
 * <ol>
 *   <li>Web 侧传来的标识**只认白名单**（脏值绝不能变成一次写入）；</li>
 *   <li>每档的「样式 + 大格子表现 + 格子数」是固定的（配置页预填、pin 尺寸提示、provider 默认样式都读它）；</li>
 *   <li>标识与格子数**一一对应**（`cell_4x3` 必须是 4×3）。</li>
 * </ol>
 *
 * <p>2026-09-21 维护面收缩后：只有 `cell_3x2`（接下来）与 `cell_1x2`（紧凑）两档会进系统拾取器；
 * 其余五档的数据**保留**（存量实例的归属校验与样式回退要用），因此这里仍断言 7 档齐全。
 * 原先的「按尺寸最近邻匹配」（`WidgetPreset#match`）已随口径变更删除，不再有对应断言。
 */
public class WidgetPresetTest {

    private static final String[] MAINTAINED_IDS = {
            WidgetPreset.ID_CELL_3X2, WidgetPreset.ID_CELL_1X2
    };

    @Test
    public void knownIdsMapToTheirBundle() {
        // 维护档：3×2 是「接下来」，1×2 是「紧凑」——pin 面板的卡片名与拾取器标签都靠它对齐。
        WidgetPreset threeTwo = WidgetPreset.parse("cell_3x2");
        assertNotNull(threeTwo);
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, threeTwo.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, threeTwo.getWideLayout());
        assertEquals("3×2", threeTwo.getCellLabel());

        WidgetPreset oneTwo = WidgetPreset.parse("cell_1x2");
        assertNotNull(oneTwo);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, oneTwo.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, oneTwo.getWideLayout());
        assertEquals("1×2", oneTwo.getCellLabel());

        // 收起档：数据保留，样式与格子数不变（存量实例仍按它回退）。
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

        WidgetPreset standard = WidgetPreset.parse("cell_4x3");
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, standard.getWideLayout());
        assertEquals("4×3", standard.getCellLabel());

        WidgetPreset widest = WidgetPreset.parse("cell_6x3");
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, widest.getWideLayout());
        assertEquals("6×3", widest.getCellLabel());
    }

    /** 标识与格子数必须一致：`cell_WxH` 里的数字是 provider 注册表与清单的共同依据。 */
    @Test
    public void idsAgreeWithTheirCellCounts() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            assertEquals(preset.getId(), "cell_" + preset.getCellWidth() + "x" + preset.getCellHeight());
            assertEquals(preset.getCellLabel(), preset.getCellWidth() + "×" + preset.getCellHeight());
        }
        assertEquals(7, WidgetPreset.all().size());
    }

    /** 维护档必须排在最前（拾取器与面板都按这个顺序读）。 */
    @Test
    public void maintainedPresetsComeFirst() {
        assertEquals(MAINTAINED_IDS.length, WidgetProviderRegistry.maintainedEntries().size());
        for (int index = 0; index < MAINTAINED_IDS.length; index++) {
            assertEquals(MAINTAINED_IDS[index], WidgetPreset.all().get(index).getId());
        }
    }

    /** 每个预设至少要有一个标定样本，且样本是正数（pin 的尺寸提示要用它）。 */
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
        assertEquals(WidgetPreset.ID_CELL_3X2, WidgetPreset.parse("  CELL_3X2 ").getId());
        assertEquals(WidgetPreset.ID_CELL_4X3, WidgetPreset.parse("  CELL_4X3 ").getId());
        assertEquals(WidgetPreset.ID_CELL_1X2, WidgetPreset.parse("Cell_1x2").getId());
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

    /** 两档维护档的标定尺寸：3×2 用真机实测值，1×2 目前是估算值（待真机校准，见 A6）。 */
    @Test
    public void maintainedPresetsCarryTheirCalibration() {
        assertEquals(276f, WidgetPreset.parse(WidgetPreset.ID_CELL_3X2).getWidthDp(), 0.01f);
        assertEquals(210f, WidgetPreset.parse(WidgetPreset.ID_CELL_3X2).getHeightDp(), 0.01f);
        assertEquals(210f, WidgetPreset.parse(WidgetPreset.ID_CELL_1X2).getHeightDp(), 0.01f);
        assertTrue(WidgetPreset.parse(WidgetPreset.ID_CELL_1X2).getWidthDp() > 0f);
    }
}
