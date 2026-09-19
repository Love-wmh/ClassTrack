package com.classtrack.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;

/**
 * Web → 原生 的快照通道。
 *
 * Web 侧把算好的课表快照（绝对 epoch + 预格式化文案）推过来，这里只做三件事：
 * 校验、落盘、触发小工具刷新。原生侧不解析 localStorage、不重算周次、不做日期运算。
 */
@CapacitorPlugin(name = "WidgetSnapshot")
public class WidgetSnapshotPlugin extends Plugin {
    @PluginMethod
    public void pushSnapshot(PluginCall call) {
        String snapshotJson = call.getString("snapshotJson");
        if (snapshotJson == null || snapshotJson.isEmpty()) {
            WidgetDiagnostics.snapshotRejected("invalid", 0);
            call.reject("快照数据为空", "INVALID_PAYLOAD");
            return;
        }

        int byteLength = snapshotJson.getBytes(StandardCharsets.UTF_8).length;
        if (byteLength > WidgetSnapshotStore.MAX_PAYLOAD_BYTES) {
            WidgetDiagnostics.snapshotRejected("too_large", byteLength);
            call.reject("快照数据超过大小上限", "PAYLOAD_TOO_LARGE");
            return;
        }

        if (WidgetSnapshotParser.parse(snapshotJson) == null) {
            WidgetDiagnostics.snapshotRejected("invalid", byteLength);
            call.reject("快照格式无效", "INVALID_PAYLOAD");
            return;
        }

        if (!WidgetSnapshotStore.write(getContext(), snapshotJson)) {
            WidgetDiagnostics.snapshotRejected("storage", byteLength);
            call.reject("快照写入失败", "STORAGE_ERROR");
            return;
        }

        // 只有确认落盘之后才 resolve：否则 Web 侧会以为推送成功，而小工具可能仍读到旧值。
        WidgetDiagnostics.snapshotStored(byteLength);
        WidgetDiagnostics.refreshRequested("plugin_push");
        // TODO(P4): 落盘成功后触发 WidgetRefreshBridge.requestRefresh(getContext()) 立即重渲染。
        call.resolve();
    }

    /**
     * 应用回到前台时通知 Web 层重新计算并推送。
     *
     * `Bridge.onResume()` 会遍历已注册插件调用这里，因此不需要额外引入 `@capacitor/app`。
     */
    @Override
    protected void handleOnResume() {
        notifyListeners("resumed", null);
    }
}
