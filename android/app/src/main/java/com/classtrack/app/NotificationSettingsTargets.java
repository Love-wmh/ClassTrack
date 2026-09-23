package com.classtrack.app;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 「打开本应用的通知设置」要跳的页面，按可用性排成的**目标链**（纯函数，不依赖 Android 运行期）。
 *
 * <p>为什么是一条链而不是一个 Intent：三个候选页在真实 ROM 上各有缺失的情况 ——
 * 渠道页要求 API 26+ 且渠道必须存在（用户可能把「应用更新」这个渠道删掉），
 * 应用通知页要求 API 26+，两者都起不来时只能退到应用详情页让用户自己点进通知。
 * 逐个尝试、第一个成功即停，比赌某一个页面存在更可靠。
 *
 * <p>类里刻意只放**字面量常量**、不 import `android.provider.Settings`：这样本类可以在普通 JVM
 * 单测里直接跑；字面量与平台常量的对应关系由 {@code NotificationSettingsTargetsTest} 用真实
 * `Settings.ACTION_*` / `Settings.EXTRA_*` 钉住（拼错了那一组用例会红）。
 */
final class NotificationSettingsTargets {

    /** 等同 `Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS`（API 26+）。 */
    static final String ACTION_CHANNEL = "android.settings.CHANNEL_NOTIFICATION_SETTINGS";
    /** 等同 `Settings.ACTION_APP_NOTIFICATION_SETTINGS`（API 26+）。 */
    static final String ACTION_APP_NOTIFICATION = "android.settings.APP_NOTIFICATION_SETTINGS";
    /** 等同 `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`（全部版本都有）。 */
    static final String ACTION_APP_DETAILS = "android.settings.APPLICATION_DETAILS_SETTINGS";

    /** 等同 `Settings.EXTRA_CHANNEL_ID`。 */
    static final String EXTRA_CHANNEL_ID = "android.provider.extra.CHANNEL_ID";
    /** 等同 `Settings.EXTRA_APP_PACKAGE`。 */
    static final String EXTRA_APP_PACKAGE = "android.provider.extra.APP_PACKAGE";

    /** 渠道页要求 API 26（Android 8.0）才有通知渠道。 */
    static final int MIN_SDK_CHANNEL_SETTINGS = 26;

    /**
     * 渠道 id 的合法形态。
     *
     * <p>渠道 id 是**从 Web 层传进来的**，因此按不可信输入处理：非法值直接跳过渠道页，
     * 而不是把它塞进 Intent 交给系统设置去处理（那时报的是别的进程里的异常，排查成本高）。
     * 与 Android 自身对 channel id 的长度约束一致（1–64 个字符）。
     */
    private static final Pattern CHANNEL_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_.-]{1,64}$");

    /** 一个候选目标：`action` + `data` + 可选的单个 extra。 */
    static final class Target {
        final String action;
        final String data;
        final String extraKey;
        final String extraValue;

        Target(String action, String data, String extraKey, String extraValue) {
            this.action = action;
            this.data = data;
            this.extraKey = extraKey;
            this.extraValue = extraValue;
        }
    }

    private NotificationSettingsTargets() {}

    /**
     * 按可用性排出目标链。
     *
     * @param sdkInt 当前系统 API 级别。
     * @param packageName 本应用包名。
     * @param channelId 通知渠道 id；为空或形态不合法时跳过渠道页。
     * @return 至少含一个目标（应用详情页在全部版本上都存在）。
     */
    static List<Target> ordered(int sdkInt, String packageName, String channelId) {
        List<Target> targets = new ArrayList<>(3);
        String packageData = "package:" + packageName;

        if (sdkInt >= MIN_SDK_CHANNEL_SETTINGS) {
            if (isValidChannelId(channelId)) {
                targets.add(new Target(ACTION_CHANNEL, packageData, EXTRA_CHANNEL_ID, channelId));
            }
            targets.add(new Target(ACTION_APP_NOTIFICATION, packageData, EXTRA_APP_PACKAGE, packageName));
        }

        targets.add(new Target(ACTION_APP_DETAILS, packageData, null, null));

        return targets;
    }

    /** 渠道 id 是不是可以安全塞进 Intent 的形态。 */
    static boolean isValidChannelId(String channelId) {
        return channelId != null && CHANNEL_ID_PATTERN.matcher(channelId).matches();
    }
}
