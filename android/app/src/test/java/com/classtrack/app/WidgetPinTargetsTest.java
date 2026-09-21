package com.classtrack.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * 确认回调的目标实例判决。
 *
 * <p>这个类是被模拟器实测逼出来的：AOSP Launcher3 的确认回调把 `EXTRA_APPWIDGET_ID` 发成 `0`
 * （真实新实例是 8），只信回调 id 的写法会让预设静默丢失 —— 而真机上 ColorOS 根本不确认，
 * 这条路径永远不会被执行到，所以必须有单测钉住两级判决。
 */
public class WidgetPinTargetsTest {

    @Test
    public void trustworthyCallbackIdWinsEvenWhenOtherInstancesAppeared() {
        // 回调 id 可信时不做差集：用户可能同时放下了别的小工具。
        assertArrayEquals(new int[]{8}, WidgetPinTargets.resolve(new int[]{5, 7}, new int[]{5, 7, 8, 9}, 8));
    }

    @Test
    public void bogusZeroCallbackIdFallsBackToTheSetDifference() {
        // 实测现场：baseline {5,7}，回调 id = 0，当前 {5,7,8} → 新实例是 8。
        assertArrayEquals(new int[]{8}, WidgetPinTargets.resolve(new int[]{5, 7}, new int[]{5, 7, 8}, 0));
    }

    @Test
    public void unknownCallbackIdIsIgnoredRatherThanTrusted() {
        assertArrayEquals(new int[]{8}, WidgetPinTargets.resolve(new int[]{5}, new int[]{5, 8}, 42));
    }

    @Test
    public void invalidNegativeCallbackIdFallsBackToTheSetDifference() {
        assertArrayEquals(new int[]{8}, WidgetPinTargets.resolve(new int[]{5}, new int[]{5, 8}, -1));
    }

    @Test
    public void firstEverWidgetResolvesAgainstAnEmptyBaseline() {
        // 用户还没有任何实例：基线是**有效的空集合**（不是「不知道」），因此差集 = 当前全集。
        assertArrayEquals(new int[]{1}, WidgetPinTargets.resolve(new int[0], new int[]{1}, 0));
    }

    @Test
    public void unknownBaselineNeverWidensToEveryInstance() {
        // 基线缺失/超时（null）时必须什么都不写：否则差集 = 当前全集，预设会盖到用户所有旧卡片上。
        assertArrayEquals(new int[0], WidgetPinTargets.resolve(null, new int[]{5, 6, 7, 8}, 0));
        // 但可信的回调 id 仍然可用 —— 那不需要基线。
        assertArrayEquals(new int[]{8}, WidgetPinTargets.resolve(null, new int[]{5, 6, 7, 8}, 8));
    }

    @Test
    public void multipleFreshInstancesAreAllReturned() {
        assertArrayEquals(new int[]{8, 9}, WidgetPinTargets.resolve(new int[]{5}, new int[]{9, 5, 8}, 0));
    }

    @Test
    public void nothingNewMeansNothingToWrite() {
        // 什么都不猜：差集为空时返回空数组，调用方据此不写、也不消费预设槽位。
        assertArrayEquals(new int[0], WidgetPinTargets.resolve(new int[]{5, 7}, new int[]{7, 5}, 0));
    }

    @Test
    public void noInstancesAtAllMeansNothingToWrite() {
        assertArrayEquals(new int[0], WidgetPinTargets.resolve(new int[]{5}, new int[0], 0));
    }

    @Test
    public void duplicatesInTheCurrentSetAreCollapsedAndSorted() {
        assertArrayEquals(new int[]{8, 9}, WidgetPinTargets.resolve(new int[]{}, new int[]{9, 8, 9, 8}, 0));
        assertEquals(2, WidgetPinTargets.resolve(new int[]{}, new int[]{9, 8, 9, 8}, 0).length);
    }
}
