package com.classtrack.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 解析 Web 快照；单条课程损坏不会使同一快照中的其它课程失效。 */
public final class WidgetSnapshotParser {
    /**
     * `entries` 条数上限，与 Web 侧 `WIDGET_MAX_ENTRIES` 保持一致。
     *
     * 超限说明契约被单方面改过或负载被构造过，按无效负载处理而不是默默截断 ——
     * 截断会让原生在一段没有课的窗口里静静地显示「今日无课」。
     */
    static final int MAX_ENTRIES = 800;

    private WidgetSnapshotParser() {}

    public static WidgetSnapshot parse(String json) {
        if (json == null || json.trim().isEmpty()) return null;
        try {
            JSONObject root = new JSONObject(json);
            // 严格校验版本号是数字：`optInt` 会把字符串 "1" 也强制转成 1，那样契约漂移会被静默接受。
            Object schemaValue = root.get("schemaVersion");
            if (!(schemaValue instanceof Number)) return null;
            if (((Number) schemaValue).longValue() != WidgetSnapshot.SCHEMA_VERSION) return null;
            String statusValue = requiredString(root, "status");
            WidgetSnapshot.Status status;
            if ("ok".equals(statusValue)) status = WidgetSnapshot.Status.OK;
            else if ("empty".equals(statusValue)) status = WidgetSnapshot.Status.EMPTY;
            else if ("unavailable".equals(statusValue)) status = WidgetSnapshot.Status.UNAVAILABLE;
            else return null;

            JSONArray entriesJson = root.optJSONArray("entries");
            JSONArray dayEndsJson = root.optJSONArray("dayEndEpochMs");
            if (entriesJson == null || dayEndsJson == null) return null;
            if (entriesJson.length() > MAX_ENTRIES) return null;

            long generatedAt = requiredLong(root, "generatedAtEpochMs");
            long validUntil = requiredLong(root, "validUntilEpochMs");
            // generatedAt / timezone 只用于诊断，缺失不应让整份快照不可用。
            String generatedAtLabel = root.optString("generatedAt", "");
            String timezone = root.optString("timezone", "");
            // 「今天」的日期与星期同样是**可选**字段：上一版应用写入的快照没有它们，
            // 缺了只是 hero 的日期行不画日期，绝不能让整份快照不可用。
            String todayDayKey = root.optString("todayDayKey", "");
            String todayWeekdayLabel = root.optString("todayWeekdayLabel", "");

            List<WidgetOccurrence> entries = new ArrayList<>();
            for (int index = 0; index < entriesJson.length(); index++) {
                WidgetOccurrence occurrence = parseOccurrence(entriesJson.opt(index));
                if (occurrence != null) entries.add(occurrence);
            }
            entries.sort(Comparator.comparingLong(WidgetOccurrence::getStartEpochMs));

            List<Long> dayEnds = new ArrayList<>();
            for (int index = 0; index < dayEndsJson.length(); index++) {
                Object value = dayEndsJson.opt(index);
                if (!(value instanceof Number)) return null;
                dayEnds.add(((Number) value).longValue());
            }
            return new WidgetSnapshot(WidgetSnapshot.SCHEMA_VERSION, status, generatedAt,
                    validUntil, entries, dayEnds, generatedAtLabel, timezone, todayDayKey, todayWeekdayLabel);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static WidgetOccurrence parseOccurrence(Object value) {
        if (!(value instanceof JSONObject)) return null;
        JSONObject object = (JSONObject) value;
        try {
            String id = requiredString(object, "id");
            String name = requiredString(object, "name");
            String classroom = requiredString(object, "classroom");
            String sections = requiredString(object, "sections");
            long start = requiredLong(object, "startEpochMs");
            long end = requiredLong(object, "endEpochMs");
            String startLabel = requiredString(object, "startLabel");
            String endLabel = requiredString(object, "endLabel");
            String dayKey = requiredString(object, "dayKey");
            long dayOffset = requiredLong(object, "dayOffset");
            String weekdayLabel = requiredString(object, "weekdayLabel");
            if (dayOffset < Integer.MIN_VALUE || dayOffset > Integer.MAX_VALUE) return null;
            return new WidgetOccurrence(id, name, classroom, sections, start, end,
                    startLabel, endLabel, dayKey, (int) dayOffset, weekdayLabel);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String requiredString(JSONObject object, String key) throws Exception {
        Object value = object.get(key);
        if (!(value instanceof String)) throw new IllegalArgumentException(key);
        return (String) value;
    }

    private static long requiredLong(JSONObject object, String key) throws Exception {
        Object value = object.get(key);
        if (!(value instanceof Number)) throw new IllegalArgumentException(key);
        Number number = (Number) value;
        double asDouble = number.doubleValue();
        long asLong = number.longValue();
        if (Double.isNaN(asDouble) || Double.isInfinite(asDouble) || asDouble != asLong) {
            throw new IllegalArgumentException(key);
        }
        return asLong;
    }
}
