package com.classtrack.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CourseImportPlugin.class);
        // 桌面小工具的快照通道：Web 侧推送课表快照，原生侧落盘并刷新小工具。
        registerPlugin(WidgetSnapshotPlugin.class);
        // 小工具点击带来的待跳转路由必须在这里先记下来：Web 层可能在稍后才消费它。
        capturePendingRoute(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // MainActivity 是 singleTask：应用已在运行时点击小工具走的是这里，而不是 onCreate。
        capturePendingRoute(intent);
    }

    /**
     * 记录来自小工具的待跳转路由。
     *
     * 取值与白名单校验都在 {@link WidgetPendingRoute} 内完成，这里只负责把 Intent 转交过去；
     * 其它来源的 Intent 不带该 extra，因此等价于清空待跳转。
     *
     * @param intent 启动或复用本 Activity 的 Intent，可能为 null。
     */
    private void capturePendingRoute(Intent intent) {
        WidgetPendingRoute.setPendingRoute(intent == null ? null : intent.getStringExtra(WidgetPendingRoute.EXTRA_ROUTE));
    }
}
