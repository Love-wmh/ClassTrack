package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * 预设表的解析与回退。
 *
 * <p>它守住两件事：Web 侧传来的标识**只认白名单**（脏值绝不能变成一次写入），以及每个预设的
 * 「样式 + 大格子表现 + 目标格子」是固定的（配置页预填与 pin 尺寸提示都读它）。
 */
public class WidgetPresetTest {

    @Test
    public void knownIdsMapToTheirBundle() {
        WidgetPreset minimal = WidgetPreset.parse("phone_minimal");
        assertNotNull(minimal);
        assertEquals(WidgetStyleConfig.LayoutStyle.COMPACT, minimal.getLayoutStyle());
        assertEquals(WidgetStyleConfig.WideLayout.ADAPTIVE, minimal.getWideLayout());
        assertEquals("2×2", minimal.getCellLabel());

        WidgetPreset standard = WidgetPreset.parse("phone_standard");
        assertEquals(WidgetStyleConfig.LayoutStyle.NEXT_UP, standard.getLayoutStyle());
        assertEquals("4×3", standard.getCellLabel());

        WidgetPreset wide = WidgetPreset.parse("phone_wide");
        assertEquals("4×2", wide.getCellLabel());

        WidgetPreset dual = WidgetPreset.parse("tablet_dual");
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, dual.getWideLayout());
        assertEquals("4×3", dual.getCellLabel());
        assertEquals(733f, dual.getWidthDp(), 0.5f);

        WidgetPreset tabletWide = WidgetPreset.parse("tablet_wide");
        assertEquals(WidgetStyleConfig.WideLayout.TWO_COLUMN, tabletWide.getWideLayout());
        assertEquals("6×3", tabletWide.getCellLabel());
        assertEquals(1142f, tabletWide.getWidthDp(), 0.5f);
    }

    /** 大小写与空白不该让预设失效：Web 侧只是一个字符串参数，容错比严格更实用。 */
    @Test
    public void parsingIsTolerantButStillWhitelisted() {
        assertEquals(WidgetPreset.ID_TABLET_DUAL, WidgetPreset.parse("  TABLET_DUAL ").getId());
        assertEquals(WidgetPreset.ID_PHONE_WIDE, WidgetPreset.parse("Phone_Wide").getId());
    }

    /** 未知/空/非法输入一律返回 null，由调用方走「未选预设」的默认行为。 */
    @Test
    public void unknownInputsFallBackToNoPreset() {
        assertNull(WidgetPreset.parse(null));
        assertNull(WidgetPreset.parse(""));
        assertNull(WidgetPreset.parse("   "));
        assertNull(WidgetPreset.parse("tablet_6x6"));
        assertNull(WidgetPreset.parse("'; DROP TABLE presets; --"));
    }
}
