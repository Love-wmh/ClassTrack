package com.classtrack.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 「有哪些小工具 provider，各自对应哪一档预设」的**唯一真相源**。
 *
 * <p>为什么单独抽出来且只用字符串：这份清单必须与 `AndroidManifest.xml`、五份 `*_widget_info.xml`
 * <p>为什么单独抽出来且只用字符串：这份清单必须与 `AndroidManifest.xml`、七份 `*_widget_info.xml`
 * 让 JUnit 能直接验证（见 {@code WidgetProviderRegistryTest}），并让跨层测试把它跟清单/资源文件对齐。
 *
 * <p>与 Android 的桥接在 {@link WidgetProviders}（那里才出现 `ComponentName`）。
 *
 * <p>**维护档 vs 收起档**（2026-09-21 维护面收缩）：只有 `maintained = true` 的两档（3×2「接下来」、
 * 1×2「紧凑」）会出现在系统拾取器里；其余档位的 receiver 会在应用启动时被禁用（见
 * `WidgetProviderScopeGate`），但它们的类、清单条目与这里的条目**一律保留** —— 桌面上可能还留着
 * 这些尺寸的实例，配置页的归属校验也必须继续认它们（见 {@link #isOurs}）。
 *
 * <p>**`ClassTrackWidgetReceiver` 这个名字不能改**：它是 2026-09-20 之前就发布的 provider，
 * 改名会让桌面上已有的实例全部失效（系统按组件名找回 provider）。它现在代表 **4×3** 那一档。
 */
public final class WidgetProviderRegistry {

    /** 一个 provider：receiver 类名 + 它对应的预设标识 + 是否属于「维护档」。 */
    public static final class Entry {
        private final String receiverClassName;
        private final String presetId;
        private final boolean maintained;

        Entry(String receiverClassName, String presetId, boolean maintained) {
            this.receiverClassName = receiverClassName;
            this.presetId = presetId;
            this.maintained = maintained;
        }

        /** @return receiver 的完整类名（与清单里 `android:name` 的后半段一致）。 */
        public String getReceiverClassName() {
            return receiverClassName;
        }

        /** @return 该 provider 对应的预设标识（{@link WidgetPreset} 白名单内的值）。 */
        public String getPresetId() {
            return presetId;
        }

        /** @return 是否属于「维护档」：只有维护档会出现在系统拾取器里（见类注释）。 */
        public boolean isMaintained() {
            return maintained;
        }
    }

    private static final String PACKAGE = "com.classtrack.app.widget.";


    // 顺序 = 维护档在前（3×2、1×2），随后是收起档；拾取器、面板与测试都读这个顺序。
    // `ClassTrackWidgetReceiver`（4×3）是唯一沿用旧类名的收起档：改名会让桌面上已有实例失效。
    private static final List<Entry> ENTRIES = Collections.unmodifiableList(new ArrayList<>(Arrays.asList(
            new Entry(PACKAGE + "Cell3x2WidgetReceiver", WidgetPreset.ID_CELL_3X2, true),
            new Entry(PACKAGE + "Cell1x2WidgetReceiver", WidgetPreset.ID_CELL_1X2, true),
            new Entry(PACKAGE + "ClassTrackWidgetReceiver", WidgetPreset.ID_CELL_4X3, false),
            new Entry(PACKAGE + "Cell2x2WidgetReceiver", WidgetPreset.ID_CELL_2X2, false),
            new Entry(PACKAGE + "Cell2x3WidgetReceiver", WidgetPreset.ID_CELL_2X3, false),
            new Entry(PACKAGE + "Cell4x2WidgetReceiver", WidgetPreset.ID_CELL_4X2, false),
            new Entry(PACKAGE + "Cell6x3WidgetReceiver", WidgetPreset.ID_CELL_6X3, false))));

    private WidgetProviderRegistry() {
    }

    /** @return 全部 provider 条目（顺序稳定：维护档在前，随后是收起档）。 */
    public static List<Entry> entries() {
        return ENTRIES;
    }

    /** @return 维护档条目 —— 系统拾取器与「添加到桌面」面板里的那两档。 */
    public static List<Entry> maintainedEntries() {
        List<Entry> maintained = new ArrayList<>();
        for (Entry entry : ENTRIES) {
            if (entry.maintained) {
                maintained.add(entry);
            }
        }
        return maintained;
    }

    /**
     * @return 收起档条目 —— 应用启动时按它禁用 receiver。
     *
     *     <p>**禁用清单由本表推导**（不是另抄一份）：漏一档就会在系统拾取器里多出一条，而这里没有第二处真相。
     */
    public static List<Entry> retiredEntries() {
        List<Entry> retired = new ArrayList<>();
        for (Entry entry : ENTRIES) {
            if (!entry.maintained) {
                retired.add(entry);
            }
        }
        return retired;
    }

    /**
     * @param receiverClassName receiver 的完整类名。
     * @return 是否是维护档；未知类名返回 `false`。
     */
    public static boolean isMaintained(String receiverClassName) {
        for (Entry entry : ENTRIES) {
            if (entry.receiverClassName.equals(receiverClassName)) {
                return entry.maintained;
            }
        }
        return false;
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
