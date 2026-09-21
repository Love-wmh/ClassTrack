package com.classtrack.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 「有哪些小工具 provider，各自对应哪一档预设」的**唯一真相源**。
 *
 * <p>为什么单独抽出来且只用字符串：这份清单必须与 `AndroidManifest.xml`、五份 `*_widget_info.xml`
 * 完全一致，而且错一处就会表现为"某个尺寸放下去是错的样式"这类难看出来的问题。因此把它做成**纯数据**，
 * 让 JUnit 能直接验证（见 {@code WidgetProviderRegistryTest}），并让跨层测试把它跟清单/资源文件对齐。
 *
 * <p>与 Android 的桥接在 {@link WidgetProviders}（那里才出现 `ComponentName`）。
 *
 * <p>**`ClassTrackWidgetReceiver` 这个名字不能改**：它是 2026-09-20 之前就发布的 provider，
 * 改名会让桌面上已有的实例全部失效（系统按组件名找回 provider）。它现在代表 **4×3** 那一档。
 */
public final class WidgetProviderRegistry {

    /** 一个 provider：receiver 类名 + 它对应的预设标识。 */
    public static final class Entry {
        private final String receiverClassName;
        private final String presetId;

        Entry(String receiverClassName, String presetId) {
            this.receiverClassName = receiverClassName;
            this.presetId = presetId;
        }

        /** @return receiver 的完整类名（与清单里 `android:name` 的后半段一致）。 */
        public String getReceiverClassName() {
            return receiverClassName;
        }

        /** @return 该 provider 对应的预设标识（{@link WidgetPreset} 白名单内的值）。 */
        public String getPresetId() {
            return presetId;
        }
    }

    private static final String PACKAGE = "com.classtrack.app.widget.";

    private static final List<Entry> ENTRIES = Collections.unmodifiableList(new ArrayList<>(Arrays.asList(
            new Entry(PACKAGE + "ClassTrackWidgetReceiver", WidgetPreset.ID_CELL_4X3),
            new Entry(PACKAGE + "Cell2x2WidgetReceiver", WidgetPreset.ID_CELL_2X2),
            new Entry(PACKAGE + "Cell2x3WidgetReceiver", WidgetPreset.ID_CELL_2X3),
            new Entry(PACKAGE + "Cell4x2WidgetReceiver", WidgetPreset.ID_CELL_4X2),
            new Entry(PACKAGE + "Cell6x3WidgetReceiver", WidgetPreset.ID_CELL_6X3))));

    private WidgetProviderRegistry() {
    }

    /** @return 全部 provider 条目（顺序稳定：4×3 在前，其余按尺寸）。 */
    public static List<Entry> entries() {
        return ENTRIES;
    }

    /** @return 全部 receiver 类名。 */
    public static List<String> receiverClassNames() {
        List<String> names = new ArrayList<>(ENTRIES.size());
        for (Entry entry : ENTRIES) {
            names.add(entry.receiverClassName);
        }
        return names;
    }

    /**
     * 按 receiver 类名取它对应的预设。
     *
     * @param receiverClassName receiver 的完整类名。
     * @return 对应预设；不属于我们的 provider 或未知类名时返回 `null`。
     */
    public static WidgetPreset presetFor(String receiverClassName) {
        if (receiverClassName == null) {
            return null;
        }
        for (Entry entry : ENTRIES) {
            if (entry.receiverClassName.equals(receiverClassName)) {
                return WidgetPreset.parse(entry.presetId);
            }
        }
        return null;
    }

    /** @param receiverClassName receiver 的完整类名。 @return 是否是我们自己注册的 provider。 */
    public static boolean isOurs(String receiverClassName) {
        return presetFor(receiverClassName) != null;
    }
}
