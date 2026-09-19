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

    public WidgetSnapshot(int schemaVersion, Status status, long generatedAtEpochMs,
            long validUntilEpochMs, List<WidgetOccurrence> entries, List<Long> dayEndEpochMs,
            String generatedAt, String timezone) {
        this.schemaVersion = schemaVersion;
        this.status = status;
        this.generatedAtEpochMs = generatedAtEpochMs;
        this.validUntilEpochMs = validUntilEpochMs;
        this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
        this.dayEndEpochMs = Collections.unmodifiableList(new ArrayList<>(dayEndEpochMs));
        this.generatedAt = generatedAt;
        this.timezone = timezone;
    }

    public int getSchemaVersion() { return schemaVersion; }
    public Status getStatus() { return status; }
    public long getGeneratedAtEpochMs() { return generatedAtEpochMs; }
    public long getValidUntilEpochMs() { return validUntilEpochMs; }
    public List<WidgetOccurrence> getEntries() { return entries; }
    public List<Long> getDayEndEpochMs() { return dayEndEpochMs; }
    public String getGeneratedAt() { return generatedAt; }
    public String getTimezone() { return timezone; }
}
