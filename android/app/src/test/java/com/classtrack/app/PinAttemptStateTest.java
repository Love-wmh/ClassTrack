package com.classtrack.app;

import static org.junit.Assert.assertEquals;

import org.junit.Before;
import org.junit.Test;

/**
 * 一次尝试的观测事实（请求时刻 + 有没有退过后台）。
 *
 * <p>三条语义是承重的：**reset 同时钉住两者**（否则会出现"请求换了、后台记录还是旧的"错配）、
 * **只保留第一次后台时刻**、**没有进行中的尝试时忽略后台记录**（与 pin 无关的切后台不能算进来）。
 */
public class PinAttemptStateTest {

    private static final long NOW = 1_800_000_000_000L;

    @Before
    public void resetState() {
        PinAttemptState.clear();
    }

    @Test
    public void resetRecordsTheRequestAndDropsThePreviousBackgroundFact() {
        PinAttemptState.reset(NOW);
        PinAttemptState.recordBackgrounded(NOW + 10L);

        PinAttemptState.reset(NOW + 1000L);

        assertEquals(NOW + 1000L, PinAttemptState.requestedAtMs());
        assertEquals("新尝试必须从「一直前台」开始", 0L, PinAttemptState.backgroundedAtMs());
    }

    @Test
    public void onlyTheFirstBackgroundTimestampIsKept() {
        PinAttemptState.reset(NOW);
        PinAttemptState.recordBackgrounded(NOW + 100L);
        PinAttemptState.recordBackgrounded(NOW + 200L);

        assertEquals(NOW + 100L, PinAttemptState.backgroundedAtMs());
    }

    @Test
    public void backgroundFactsWithoutAnActiveAttemptAreIgnored() {
        PinAttemptState.recordBackgrounded(NOW);

        assertEquals(0L, PinAttemptState.requestedAtMs());
        assertEquals(0L, PinAttemptState.backgroundedAtMs());
    }

    @Test
    public void invalidTimestampsAreIgnored() {
        PinAttemptState.reset(-5L);
        PinAttemptState.recordBackgrounded(-1L);

        assertEquals("非法请求时刻读作「没有尝试」", 0L, PinAttemptState.requestedAtMs());

        PinAttemptState.reset(NOW);
        PinAttemptState.recordBackgrounded(0L);
        PinAttemptState.recordBackgrounded(-100L);

        assertEquals(0L, PinAttemptState.backgroundedAtMs());
    }

    @Test
    public void clearEndsTheAttempt() {
        PinAttemptState.reset(NOW);
        PinAttemptState.recordBackgrounded(NOW + 5L);

        PinAttemptState.clear();

        assertEquals(0L, PinAttemptState.requestedAtMs());
        assertEquals(0L, PinAttemptState.backgroundedAtMs());
    }
}
