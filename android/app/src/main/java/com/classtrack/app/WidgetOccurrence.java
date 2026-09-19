package com.classtrack.app;

/** 一次具体上课发生的不可变快照记录。 */
public final class WidgetOccurrence {
    private final String id;
    private final String name;
    private final String classroom;
    private final String sections;
    private final long startEpochMs;
    private final long endEpochMs;
    private final String startLabel;
    private final String endLabel;
    private final String dayKey;
    private final int dayOffset;
    private final String weekdayLabel;

    public WidgetOccurrence(String id, String name, String classroom, String sections,
            long startEpochMs, long endEpochMs, String startLabel, String endLabel,
            String dayKey, int dayOffset, String weekdayLabel) {
        this.id = id;
        this.name = name;
        this.classroom = classroom;
        this.sections = sections;
        this.startEpochMs = startEpochMs;
        this.endEpochMs = endEpochMs;
        this.startLabel = startLabel;
        this.endLabel = endLabel;
        this.dayKey = dayKey;
        this.dayOffset = dayOffset;
        this.weekdayLabel = weekdayLabel;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getClassroom() { return classroom; }
    public String getSections() { return sections; }
    public long getStartEpochMs() { return startEpochMs; }
    public long getEndEpochMs() { return endEpochMs; }
    public String getStartLabel() { return startLabel; }
    public String getEndLabel() { return endLabel; }
    public String getDayKey() { return dayKey; }
    public int getDayOffset() { return dayOffset; }
    public String getWeekdayLabel() { return weekdayLabel; }
}
