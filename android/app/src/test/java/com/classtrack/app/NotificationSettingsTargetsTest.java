package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.provider.Settings;

import org.junit.Test;

import java.util.List;

/**
 * 通知设置跳转的**目标链**判决。
 *
 * <p>为什么值得单测：真机上一条走错的跳转有两种表现 —— 要么落在错误的页面（用户找不到开关），
 * 要么整条链都起不来（点了没反应）。两者都不容易靠人眼一次看出来，所以顺序、API 门限、
 * extra 的形状必须在纯函数层面钉死。
 *
 * <p>另外本测里用**平台的真实常量**与类里的字面量做等值断言：类刻意不 import Android（好让它可以
 * 在普通 JVM 里跑），代价是常量有拼错的可能 —— 这一组断言就是那道保险。
 */
public class NotificationSettingsTargetsTest {

    private static final String PACKAGE_NAME = "com.classtrack.app";
    private static final String CHANNEL_ID = "updates";

    /** 类里的字面量必须与 `android.provider.Settings` 的真实常量逐字一致。 */
    @Test
    public void literalsMatchThePlatformConstants() {
        assertEquals(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS, NotificationSettingsTargets.ACTION_CHANNEL);
        assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, NotificationSettingsTargets.ACTION_APP_NOTIFICATION);
        assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, NotificationSettingsTargets.ACTION_APP_DETAILS);
        assertEquals(Settings.EXTRA_CHANNEL_ID, NotificationSettingsTargets.EXTRA_CHANNEL_ID);
        assertEquals(Settings.EXTRA_APP_PACKAGE, NotificationSettingsTargets.EXTRA_APP_PACKAGE);
    }

    /** API 26+ 且渠道 id 合法：渠道页 → 应用通知页 → 应用详情页。 */
    @Test
    public void modernSystemWithChannelPrefersTheChannelPage() {
        List<NotificationSettingsTargets.Target> targets = NotificationSettingsTargets.ordered(33, PACKAGE_NAME, CHANNEL_ID);

        assertEquals(3, targets.size());

        NotificationSettingsTargets.Target channel = targets.get(0);
        assertEquals(NotificationSettingsTargets.ACTION_CHANNEL, channel.action);
        assertEquals("package:" + PACKAGE_NAME, channel.data);
        assertEquals(NotificationSettingsTargets.EXTRA_CHANNEL_ID, channel.extraKey);
        assertEquals(CHANNEL_ID, channel.extraValue);

        NotificationSettingsTargets.Target appNotification = targets.get(1);
        assertEquals(NotificationSettingsTargets.ACTION_APP_NOTIFICATION, appNotification.action);
        assertEquals(NotificationSettingsTargets.EXTRA_APP_PACKAGE, appNotification.extraKey);
        assertEquals(PACKAGE_NAME, appNotification.extraValue);

        NotificationSettingsTargets.Target details = targets.get(2);
        assertEquals(NotificationSettingsTargets.ACTION_APP_DETAILS, details.action);
        assertNull("应用详情页不需要 extra", details.extraKey);
    }

    /** 渠道 id 缺失或形态非法时跳过渠道页，但其余两级照旧。 */
    @Test
    public void invalidChannelIdSkipsOnlyTheChannelPage() {
        for (String invalid : new String[] { null, "", "   ", "with space", "a/b", repeat('x', 65) }) {
            List<NotificationSettingsTargets.Target> targets = NotificationSettingsTargets.ordered(33, PACKAGE_NAME, invalid);

            assertEquals("非法渠道 id 应只剩两级：" + invalid, 2, targets.size());
            assertEquals(NotificationSettingsTargets.ACTION_APP_NOTIFICATION, targets.get(0).action);
            assertEquals(NotificationSettingsTargets.ACTION_APP_DETAILS, targets.get(1).action);
        }
    }

    /** API 24/25 没有这两个设置页，只能退到应用详情页。 */
    @Test
    public void legacySystemsFallBackToAppDetails() {
        for (int sdkInt : new int[] { 24, 25 }) {
            List<NotificationSettingsTargets.Target> targets = NotificationSettingsTargets.ordered(sdkInt, PACKAGE_NAME, CHANNEL_ID);

            assertEquals(1, targets.size());
            assertEquals(NotificationSettingsTargets.ACTION_APP_DETAILS, targets.get(0).action);
        }
    }

    /** API 26 是门限值：正好 26 就该带渠道页。 */
    @Test
    public void api26IsTheBoundaryForChannelSettings() {
        assertEquals(3, NotificationSettingsTargets.ordered(26, PACKAGE_NAME, CHANNEL_ID).size());
        assertEquals(1, NotificationSettingsTargets.ordered(25, PACKAGE_NAME, CHANNEL_ID).size());
    }

    /** 渠道 id 的合法形态：字母数字与 `_ . -`，1–64 字符。 */
    @Test
    public void channelIdPattern() {
        assertTrue(NotificationSettingsTargets.isValidChannelId("updates"));
        assertTrue(NotificationSettingsTargets.isValidChannelId("app_updates.v1-beta"));
        assertTrue(NotificationSettingsTargets.isValidChannelId(repeat('a', 64)));

        assertFalse(NotificationSettingsTargets.isValidChannelId(null));
        assertFalse(NotificationSettingsTargets.isValidChannelId(""));
        assertFalse(NotificationSettingsTargets.isValidChannelId(repeat('a', 65)));
        assertFalse(NotificationSettingsTargets.isValidChannelId("通知"));
    }

    private static String repeat(char value, int count) {
        return new String(new char[count]).replace('\0', value);
    }
}
