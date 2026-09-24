package com.classtrack.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Web 侧 WidgetSnapshotV1 契约在原生侧的不可变表示。 */
public final class WidgetSnapshot {
    public static final int SCHEMA_VERSION = 1;

    public enum Status { OK, EMPTY, UNAVAILABLE }

    private final int schemaVersion;
    private final Status status;
    private final long generatedAtEpochMs;
    private final long validUntilEpochMs;
    private final List<WidgetOccurrence> entries;
    private final List<Long> dayEndEpochMs;
    private final String generatedAt;
    private final String timezone;
    /**
     * 「今天」的本地日期键（`YYYY-MM-DD`）与中文星期标签，均由 Web 预格式化。
     *
     * <p>原生不做日期运算，而「今天没课」时 {@link #entries} 里没有任何今天的课程，也就无从得到
     * 今天的日期；hero 的日期行只能靠这两个字段。它们是**可选字段**：上一版应用写入的快照没有它们，
     * 解析后退化为空串（渲染层不画日期），而不是整份快照不可用。
     */
    private final String todayDayKey;
    private final String todayWeekdayLabel;

    public WidgetSnapshot(int schemaVersion, Status status, long generatedAtEpochMs,
            long validUntilEpochMs, List<WidgetOccurrence> entries, List<Long> dayEndEpochMs,
            String generatedAt, String timezone, String todayDayKey, String todayWeekdayLabel) {
        this.schemaVersion = schemaVersion;
        this.status = status;
        this.generatedAtEpochMs = generatedAtEpochMs;
        this.validUntilEpochMs = validUntilEpochMs;
        this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
        this.dayEndEpochMs = Collections.unmodifiableList(new ArrayList<>(dayEndEpochMs));
        this.generatedAt = generatedAt;
        this.timezone = timezone;
        this.todayDayKey = todayDayKey == null ? "" : todayDayKey;
        this.todayWeekdayLabel = todayWeekdayLabel == null ? "" : todayWeekdayLabel;
    }

    public int getSchemaVersion() { return schemaVersion; }
    public Status getStatus() { return status; }
    public long getGeneratedAtEpochMs() { return generatedAtEpochMs; }
    public long getValidUntilEpochMs() { return validUntilEpochMs; }
    public List<WidgetOccurrence> getEntries() { return entries; }
    public List<Long> getDayEndEpochMs() { return dayEndEpochMs; }
    public String getGeneratedAt() { return generatedAt; }
    public String getTimezone() { return timezone; }
    /** @return 今天的本地日期键（`YYYY-MM-DD`）；旧快照里没有该字段时为空串。 */
    public String getTodayDayKey() { return todayDayKey; }
    /** @return 今天的中文星期标签（如 `周三`）；旧快照里没有该字段时为空串。 */
    public String getTodayWeekdayLabel() { return todayWeekdayLabel; }
}
