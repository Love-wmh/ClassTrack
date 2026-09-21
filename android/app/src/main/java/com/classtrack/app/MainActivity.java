package com.classtrack.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * 上报「我们退到后台了」。
     *
     * <p>只用来判定「添加到桌面」时系统有没有弹出确认界面（见 {@link PinAttempt} 与 {@link PinAttemptState}）：确认界面真的出现时会把
     * 我们挤到后台，于是这里会先被调用；ColorOS 那种「起了界面却从不置前」的失败现场则不会。
     *
     * <p>刻意**不**在 `onResume` 里清空：「本次请求期间退过后台」这个事实必须保留到下一次请求开始，
     * 否则用户切回来之后，面板就会把已经出现过的确认界面误判成「系统没有弹出确认界面」。
     */
    @Override
    public void onPause() {
        PinAttemptState.recordBackgrounded(System.currentTimeMillis());
        super.onPause();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        PinAttemptState.clear();
        registerPlugin(CourseImportPlugin.class);
        // 桌面小工具的快照通道：Web 侧推送课表快照，原生侧落盘并刷新小工具。
        registerPlugin(WidgetSnapshotPlugin.class);
        // 维护面收敛：把收起档（2×2 / 2×3 / 4×2 / 4×3 / 6×3）的 receiver 禁用掉，让系统拾取器里只剩
        // 3×2 与 1×2 两档。判决是纯函数（WidgetProviderScope），这里是幂等的执行侧 —— 每次启动跑一次。
        WidgetProviderScopeGate.apply(this);
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
