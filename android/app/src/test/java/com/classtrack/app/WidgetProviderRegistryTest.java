package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.Test;

/**
 * provider 注册表：七档尺寸与预设的一一对应，以及「维护档 / 收起档」的两分。
 *
 * <p>这份纯数据必须与三处保持一致：`AndroidManifest.xml` 里的七条 `<receiver>`、七份
 * `res/xml/widget_info_*.xml`、以及 Web 侧的预设表。对不上的表现很隐蔽（某个尺寸放下去是错的样式、
 * 或拾取器里多出一条），所以这里把"恰好七档、类名唯一、预设有效、维护档恰好两个"钉死；
 * 与清单/资源文件的一致性由跨层测试与资产检查脚本守。
 *
 * <p>2026-09-21 维护面收缩：只有两档会出现在拾取器里（它们在应用启动时被显式启用/保留），
 * 其余五档的 receiver 会被 `WidgetProviderScopeGate` 禁用。`entries()` 仍返回全部七档 —— 配置页的
 * 归属校验与实例差集都必须继续认收起档。
 */
public class WidgetProviderRegistryTest {

    @Test
    public void exactlySevenProviders() {
        assertEquals(7, WidgetProviderRegistry.entries().size());
        assertEquals(7, WidgetProviderRegistry.receiverClassNames().size());
    }

    /** **旧类名不能改**：它是已发布过的 provider，改名会让桌面上已有的实例全部失效。 */
    @Test
    public void theLegacyReceiverNameIsStillRegisteredAsThe4x3Provider() {
        assertTrue(WidgetProviderRegistry.receiverClassNames().contains("com.classtrack.app.widget.ClassTrackWidgetReceiver"));
        assertEquals(WidgetPreset.ID_CELL_4X3,
                WidgetProviderRegistry.presetFor("com.classtrack.app.widget.ClassTrackWidgetReceiver").getId());
    }

    @Test
    public void eachProviderMapsToADistinctValidPreset() {
        Set<String> presets = new HashSet<>();
        Set<String> classes = new HashSet<>();
        for (WidgetProviderRegistry.Entry entry : WidgetProviderRegistry.entries()) {
            assertTrue("类名必须唯一", classes.add(entry.getReceiverClassName()));
            assertTrue("预设必须唯一", presets.add(entry.getPresetId()));
            assertNotNull("预设标识必须在白名单里：" + entry.getPresetId(), WidgetPreset.parse(entry.getPresetId()));
            assertTrue(entry.getReceiverClassName().startsWith("com.classtrack.app.widget."));
        }
        assertEquals("七档尺寸都要有 provider", 7, presets.size());
    }

    /** 每个预设都必须在注册表里有对应 provider —— 否则那一档的 pin 面板卡片点了会没反应。 */
    @Test
    public void everyPresetHasAProvider() {
        for (WidgetPreset preset : WidgetPreset.all()) {
            boolean found = false;
            for (WidgetProviderRegistry.Entry entry : WidgetProviderRegistry.entries()) {
                if (entry.getPresetId().equals(preset.getId())) {
                    found = true;
                    break;
                }
            }
            assertTrue(preset.getId() + " 没有对应的 provider", found);
        }
    }

    /** 维护档恰好是 3×2 与 1×2：多一个会在拾取器里多出一条，少一个会少一条。 */
    @Test
    public void exactlyTwoMaintainedProviders() {
        List<WidgetProviderRegistry.Entry> maintained = WidgetProviderRegistry.maintainedEntries();
        assertEquals(2, maintained.size());
        assertEquals(WidgetPreset.ID_CELL_3X2, maintained.get(0).getPresetId());
        assertEquals(WidgetPreset.ID_CELL_1X2, maintained.get(1).getPresetId());

        // 两半互补：维护档 + 收起档 = 全部，且不重叠。
        assertEquals(7, maintained.size() + WidgetProviderRegistry.retiredEntries().size());
        for (WidgetProviderRegistry.Entry entry : WidgetProviderRegistry.retiredEntries()) {
            assertFalse(entry.isMaintained());
        }
    }

    /** 收起档包含那张必须继续存活的 4×3 条目 —— 禁用会把它从拾取器移除，但代码与清单都留着。 */
    @Test
    public void retiredEntriesKeepTheLegacyProvider() {
        Set<String> retired = new HashSet<>();
        for (WidgetProviderRegistry.Entry entry : WidgetProviderRegistry.retiredEntries()) {
            retired.add(entry.getReceiverClassName());
        }
        assertEquals(5, retired.size());
        assertTrue(retired.contains("com.classtrack.app.widget.ClassTrackWidgetReceiver"));
        assertTrue(retired.contains("com.classtrack.app.widget.Cell2x2WidgetReceiver"));
        assertTrue(retired.contains("com.classtrack.app.widget.Cell2x3WidgetReceiver"));
        assertTrue(retired.contains("com.classtrack.app.widget.Cell4x2WidgetReceiver"));
        assertTrue(retired.contains("com.classtrack.app.widget.Cell6x3WidgetReceiver"));
    }

    @Test
    public void isMaintainedOnlyAnswersForOurOwnComponents() {
        assertTrue(WidgetProviderRegistry.isMaintained("com.classtrack.app.widget.Cell3x2WidgetReceiver"));
        assertTrue(WidgetProviderRegistry.isMaintained("com.classtrack.app.widget.Cell1x2WidgetReceiver"));
        assertFalse(WidgetProviderRegistry.isMaintained("com.classtrack.app.widget.Cell2x2WidgetReceiver"));
        assertFalse(WidgetProviderRegistry.isMaintained("com.classtrack.app.widget.ClassTrackWidgetReceiver"));
        // 未知 / 外部 / null 一律按「不是我们的维护档」处理（禁用逻辑不会误伤别人）。
        assertFalse(WidgetProviderRegistry.isMaintained("com.example.OtherReceiver"));
        assertFalse(WidgetProviderRegistry.isMaintained(null));
    }

    @Test
    public void unknownOrForeignComponentsAreNotOurs() {
        assertFalse(WidgetProviderRegistry.isOurs("com.example.OtherReceiver"));
        assertNull(WidgetProviderRegistry.presetFor("com.example.OtherReceiver"));
        assertNull(WidgetProviderRegistry.presetFor(null));
        assertFalse(WidgetProviderRegistry.isOurs(null));
    }

    @Test
    public void entriesAreStableAcrossCalls() {
        List<String> first = WidgetProviderRegistry.receiverClassNames();
        List<String> second = WidgetProviderRegistry.receiverClassNames();

        assertEquals(first, second);
        // 顺序稳定：维护档在前（3×2、1×2），随后是收起档（4×3 旧类名领队）。
        assertEquals("com.classtrack.app.widget.Cell3x2WidgetReceiver", first.get(0));
        assertEquals("com.classtrack.app.widget.Cell1x2WidgetReceiver", first.get(1));
        assertEquals("com.classtrack.app.widget.ClassTrackWidgetReceiver", first.get(2));
    }
}
