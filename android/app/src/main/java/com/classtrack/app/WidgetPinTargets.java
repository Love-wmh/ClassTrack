package com.classtrack.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 决定「这次确认回调该写哪些实例」。
 *
 * <p>**为什么不能只信回调里的 id**：官方文档说成功回调会带 `EXTRA_APPWIDGET_ID`，但实测
 * **AOSP Launcher3 发回来的是 `0`**（真实新实例是 8），于是 `getGlanceIdBy(0)` 抛异常、预设静默丢失。
 * 这个失败真机（ColorOS 根本不确认）反而暴露不出来，只能靠模拟器发现。
 *
 * <p>因此判决分两级：
 *
 * <ol>
 *   <li>回调 id 合法、且确实存在于当前实例集合里 → 就用它（有些 launcher 是准的）；</li>
 *   <li>否则用**差集**：请求 pin 之前记下实例集合，回调之后再取一次，多出来的就是用户刚放下的那些。</li>
 * </ol>
 *
 * <p>差集为空时不猜（宁可什么都不写，也不要把预设盖到别人的实例上）；这时调用方**不能消费**预设槽位，
 * 留给可能随后被拉起的配置页。
 *
 * <p>纯函数：不碰 Android，可被 JUnit 覆盖（见 {@code WidgetPinTargetsTest}）。
 */
public final class WidgetPinTargets {

    private WidgetPinTargets() {
    }

    /**
     * 解析本次确认要写入的实例。
     *
     * @param baselineAppWidgetIds 发起 pin **之前**该 provider 的实例 id 集合；`null` 表示**不知道**
     *     （没记录 / 已超时，见 {@link WidgetPinBaseline#consume}），此时绝不做差集。
     * @param currentAppWidgetIds 回调**之后**该 provider 的实例 id 集合。
     * @param callbackAppWidgetId 回调带回的实例 id；不可信，仅在第一级里被采信。
     * @return 要写入的实例 id（升序、无重复）；空数组表示无法确定，调用方应什么都不做。
     */
    public static int[] resolve(int[] baselineAppWidgetIds, int[] currentAppWidgetIds, int callbackAppWidgetId) {
        int[] current = normalize(currentAppWidgetIds);
        if (current.length == 0) {
            return new int[0];
        }
        if (callbackAppWidgetId >= 0 && contains(current, callbackAppWidgetId)) {
            return new int[]{callbackAppWidgetId};
        }

        // 基线为 `null` = 我们不知道请求前有哪些实例（没记录 / 已超时）：
        // 这时**绝不**做差集 —— 差集会等于「当前全集」，把预设写到用户所有旧卡片上。
        if (baselineAppWidgetIds == null) {
            return new int[0];
        }
        int[] baseline = normalize(baselineAppWidgetIds);
        List<Integer> fresh = new ArrayList<>();
        for (int id : current) {
            if (!contains(baseline, id)) {
                fresh.add(id);
            }
        }
        int[] resolved = new int[fresh.size()];
        for (int index = 0; index < fresh.size(); index++) {
            resolved[index] = fresh.get(index);
        }
        return resolved;
    }

    private static int[] normalize(int[] ids) {
        if (ids == null || ids.length == 0) {
            return new int[0];
        }
        int[] copy = Arrays.copyOf(ids, ids.length);
        Arrays.sort(copy);
        int unique = 0;
        for (int index = 0; index < copy.length; index++) {
            if (index == 0 || copy[index] != copy[index - 1]) {
                copy[unique++] = copy[index];
            }
        }
        return Arrays.copyOf(copy, unique);
    }

    private static boolean contains(int[] ids, int target) {
        for (int id : ids) {
            if (id == target) {
                return true;
            }
        }
        return false;
    }
}
