package com.classtrack.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CourseImportPlugin.class);
        // 桌面小工具的快照通道：Web 侧推送课表快照，原生侧落盘并刷新小工具。
        registerPlugin(WidgetSnapshotPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
