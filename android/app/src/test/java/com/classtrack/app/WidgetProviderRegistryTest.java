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
 * provider 注册表：五档尺寸与预设的一一对应。
 *
 * <p>这份纯数据必须与三处保持一致：`AndroidManifest.xml` 里的五条 `<receiver>`、五份
 * `res/xml/widget_info_*.xml`、以及 Web 侧的预设表。对不上的表现很隐蔽（某个尺寸放下去是错的样式），
 * 所以这里把"恰好五个、类名唯一、预设有效"钉死；与清单/资源文件的一致性由跨层测试与资产检查脚本守。
 */
public class WidgetProviderRegistryTest {

    @Test
    public void exactlyFiveProviders() {
        assertEquals(5, WidgetProviderRegistry.entries().size());
        assertEquals(5, WidgetProviderRegistry.receiverClassNames().size());
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
        assertEquals("五档尺寸都要有 provider", 5, presets.size());
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
        // 顺序稳定：4×3（旧类名）在首位，其余按尺寸 —— 面板与清单顺序都依赖它。
        assertEquals("com.classtrack.app.widget.ClassTrackWidgetReceiver", first.get(0));
    }
}
