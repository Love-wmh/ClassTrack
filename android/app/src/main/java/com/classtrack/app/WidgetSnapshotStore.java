package com.classtrack.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;

/**
 * 快照的应用私有持久化。
 *
 * 小工具接收器会在进程冷启动时被唤醒（此时没有 Activity、没有 Capacitor Bridge），
 * 因此快照必须落在「不依赖 WebView 存在」的地方：应用私有 SharedPreferences。
 *
 * 只写单个键，值是完整的一整个 JSON 字符串，因此读者不可能观察到「半新半旧」的快照。
 * 写入用 `commit()` 而不是 `apply()`：调用方必须在 `call.resolve()` 之前确认已经落盘，
 * 否则 JS 会以为推送成功，而小工具可能仍读到旧值。
 */
public final class WidgetSnapshotStore {
    /** 独立的偏好文件名，避免与 Capacitor / WebView 的偏好混在一起。 */
    static final String PREFS_NAME = "class-track-widget";

    static final String KEY_SNAPSHOT_JSON = "snapshot_json";

    /** 与 Web 侧 `WIDGET_SNAPSHOT_MAX_BYTES` 保持一致的字节上限。 */
    static final int MAX_PAYLOAD_BYTES = 256 * 1024;

    private WidgetSnapshotStore() {}

    /**
     * 读取最近一次推送的快照。
     *
     * @param context 任意 Context。
     * @return 快照 JSON；从未推送过时返回 `null`。
     */
    public static String read(Context context) {
        if (context == null) return null;
        return preferences(context).getString(KEY_SNAPSHOT_JSON, null);
    }

    /**
     * 写入快照。
     *
     * 这里只做机械性边界检查（非空、字节上限）与落盘结果判定；**JSON 格式校验由调用方**
     * （{@link WidgetSnapshotPlugin}）在解析阶段完成，避免对同一份上百 KB 的负载解析两次。
     *
     * @param context 任意 Context。
     * @param snapshotJson 已由调用方解析通过的快照 JSON。
     * @return 是否确认落盘成功。
     */
    public static boolean write(Context context, String snapshotJson) {
        if (context == null || snapshotJson == null || snapshotJson.isEmpty()) return false;
        if (snapshotJson.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) return false;

        return preferences(context).edit().putString(KEY_SNAPSHOT_JSON, snapshotJson).commit();
    }

    /**
     * 清除快照，供测试或用户主动重置时使用。
     *
     * @param context 任意 Context。
     * @return 是否确认清除成功。
     */
    public static boolean clear(Context context) {
        if (context == null) return false;
        return preferences(context).edit().remove(KEY_SNAPSHOT_JSON).commit();
    }

    /**
     * 取私有偏好文件。
     *
     * @param context 任意 Context。
     * @return 偏好实例。
     */
    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
