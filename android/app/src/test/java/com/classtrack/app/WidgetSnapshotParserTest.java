package com.classtrack.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;
import java.util.Locale;

/**
 * {@link WidgetSnapshotParser} 的纯逻辑测试。
 *
 * 用 `org.json` 的真实实现（测试依赖 `org.json:json`），与 Android 运行期的 API 一致；
 * 不依赖任何 Android 框架类，因此不需要设备或模拟器。
 */
public class WidgetSnapshotParserTest {
    private static final String VALID_PAYLOAD = "{"
            + "\"schemaVersion\":1,"
            + "\"status\":\"ok\","
            + "\"generatedAtEpochMs\":1700000000000,"
            + "\"validUntilEpochMs\":1700259200000,"
            + "\"generatedAt\":\"2026-09-07T09:00:00+08:00\","
            + "\"timezone\":\"Asia/Shanghai\","
            + "\"todayDayKey\":\"2026-09-07\",\"todayWeekdayLabel\":\"周一\","
            + "\"dayEndEpochMs\":[1700003600000,1700090000000],"
            + "\"entries\":["
            + "{\"id\":\"MATH#2026-09-07\",\"name\":\"高等数学\",\"classroom\":\"A101\",\"sections\":\"3-4\","
            + "\"startEpochMs\":1700006400000,\"endEpochMs\":1700012400000,\"startLabel\":\"10:00\",\"endLabel\":\"11:40\","
            + "\"dayKey\":\"2026-09-07\",\"dayOffset\":0,\"weekdayLabel\":\"周一\"},"
            + "{\"id\":\"PHY#2026-09-07\",\"name\":\"大学物理\",\"classroom\":\"B202\",\"sections\":\"5-6\","
            + "\"startEpochMs\":1700019000000,\"endEpochMs\":1700025000000,\"startLabel\":\"13:30\",\"endLabel\":\"15:10\","
            + "\"dayKey\":\"2026-09-07\",\"dayOffset\":0,\"weekdayLabel\":\"周一\"}"
            + "]}";

    @Test
    public void parsesACompletePayload() {
        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(VALID_PAYLOAD);

        assertNotNull(snapshot);
        assertEquals(WidgetSnapshot.SCHEMA_VERSION, snapshot.getSchemaVersion());
        assertEquals(WidgetSnapshot.Status.OK, snapshot.getStatus());
        assertEquals(1700000000000L, snapshot.getGeneratedAtEpochMs());
        assertEquals(1700259200000L, snapshot.getValidUntilEpochMs());
        assertEquals(2, snapshot.getDayEndEpochMs().size());
        assertEquals(Long.valueOf(1700090000000L), snapshot.getDayEndEpochMs().get(1));
        assertEquals("Asia/Shanghai", snapshot.getTimezone());
        assertEquals("2026-09-07", snapshot.getTodayDayKey());
        assertEquals("周一", snapshot.getTodayWeekdayLabel());
        assertEquals(2, snapshot.getEntries().size());
        assertEquals("高等数学", snapshot.getEntries().get(0).getName());
        assertEquals("A101", snapshot.getEntries().get(0).getClassroom());
        assertEquals(0, snapshot.getEntries().get(0).getDayOffset());
    }

    /**
     * 「今天」的日期与星期是**可选**字段：上一版应用写入的快照没有它们，
     * 缺了只是 hero 的日期行不画日期，绝不能让整份快照不可用。
     */
    @Test
    public void treatsMissingTodayFieldsAsEmpty() {
        String legacy = replace(VALID_PAYLOAD, "\"todayDayKey\":\"2026-09-07\",\"todayWeekdayLabel\":\"周一\",", "");
        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(legacy);

        assertNotNull(snapshot);
        assertEquals(WidgetSnapshot.Status.OK, snapshot.getStatus());
        assertEquals(2, snapshot.getEntries().size());
        assertEquals("", snapshot.getTodayDayKey());
        assertEquals("", snapshot.getTodayWeekdayLabel());
    }

    @Test
    public void rejectsNullOrBlankInput() {
        assertNull(WidgetSnapshotParser.parse(null));
        assertNull(WidgetSnapshotParser.parse(""));
        assertNull(WidgetSnapshotParser.parse("   "));
    }

    @Test
    public void rejectsMalformedJson() {
        assertNull(WidgetSnapshotParser.parse("{\"schemaVersion\":1,"));
        assertNull(WidgetSnapshotParser.parse("[1,2,3]"));
        assertNull(WidgetSnapshotParser.parse("not json at all"));
        // 合法 JSON 但缺少必需字段。
        assertNull(WidgetSnapshotParser.parse("{\"schemaVersion\":1,\"status\":\"ok\"}"));
    }

    @Test
    public void rejectsSchemaVersionMismatch() {
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"schemaVersion\":1", "\"schemaVersion\":2")));
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"schemaVersion\":1", "\"schemaVersion\":\"1\"")));
    }

    @Test
    public void rejectsUnknownStatus() {
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"status\":\"ok\"", "\"status\":\"fine\"")));
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"status\":\"ok\"", "\"status\":\"OK\"")));
    }

    @Test
    public void rejectsNonArrayCollections() {
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"dayEndEpochMs\":[1700003600000,1700090000000]", "\"dayEndEpochMs\":\"nope\"")));
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"entries\":[", "\"entries\":\"nope\",\"ignored\":[")));
    }

    @Test
    public void rejectsDayEndsThatAreNotNumbers() {
        assertNull(WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"dayEndEpochMs\":[1700003600000,1700090000000]", "\"dayEndEpochMs\":[1700003600000,\"later\"]")));
    }

    @Test
    public void rejectsEntriesBeyondTheContractCap() {
        StringBuilder oversized = new StringBuilder("{\"schemaVersion\":1,\"status\":\"ok\",\"generatedAtEpochMs\":1,\"validUntilEpochMs\":2,\"dayEndEpochMs\":[],\"entries\":[");
        for (int index = 0; index <= WidgetSnapshotParser.MAX_ENTRIES; index++) {
            if (index > 0) oversized.append(',');
            oversized.append("{\"id\":\"C").append(index).append("\",\"name\":\"n\",\"classroom\":\"\",\"sections\":\"1\",")
                    .append("\"startEpochMs\":1,\"endEpochMs\":2,\"startLabel\":\"08:00\",\"endLabel\":\"09:00\",")
                    .append("\"dayKey\":\"2026-09-07\",\"dayOffset\":0,\"weekdayLabel\":\"周一\"}");
        }
        oversized.append("]}");

        assertNull(WidgetSnapshotParser.parse(oversized.toString()));
    }

    @Test
    public void skipsOnlyTheCorruptedEntryInsteadOfFailingTheWholeSnapshot() {
        // 第一条缺少 classroom，只应跳过它，第二条仍然可用。
        String payload = replace(VALID_PAYLOAD, "\"classroom\":\"A101\",", "");

        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(payload);

        assertNotNull(snapshot);
        assertEquals(1, snapshot.getEntries().size());
        assertEquals("PHY#2026-09-07", snapshot.getEntries().get(0).getId());
    }

    @Test
    public void skipsEntriesWithNonIntegralDayOffset() {
        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"dayOffset\":0", "\"dayOffset\":0.5"));

        assertNotNull(snapshot);
        assertTrue(snapshot.getEntries().isEmpty());
    }

    @Test
    public void sortsEntriesByStartTimeEvenWhenThePayloadIsOutOfOrder() {
        String reordered = reorderEntries(VALID_PAYLOAD);
        // 先确认夹具真的把两条 entry 换过位置，否则下面的排序断言会退化成「本来就排好」的空断言。
        assertTrue(reordered.indexOf("PHY#2026-09-07") < reordered.indexOf("MATH#2026-09-07"));

        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(reordered);

        assertNotNull(snapshot);
        List<WidgetOccurrence> entries = snapshot.getEntries();
        assertEquals(2, entries.size());
        // 解析结果按 startEpochMs 升序：高等数学（10:00）排在大学物理（13:30）之前。
        assertEquals("MATH#2026-09-07", entries.get(0).getId());
        assertEquals("PHY#2026-09-07", entries.get(1).getId());
    }

    @Test
    public void rejectsEntriesWhoseNumericFieldsAreStrings() {
        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(replace(VALID_PAYLOAD, "\"startEpochMs\":1700019000000", "\"startEpochMs\":\"1700019000000\""));

        assertNotNull(snapshot);
        assertEquals(1, snapshot.getEntries().size());
        assertEquals("MATH#2026-09-07", snapshot.getEntries().get(0).getId());
    }

    @Test
    public void toleratesMissingDiagnosticOnlyFields() {
        String withoutDiagnostics = replace(replace(VALID_PAYLOAD, ",\"generatedAt\":\"2026-09-07T09:00:00+08:00\"", ""),
                ",\"timezone\":\"Asia/Shanghai\"", "");

        WidgetSnapshot snapshot = WidgetSnapshotParser.parse(withoutDiagnostics);

        assertNotNull(snapshot);
        assertEquals("", snapshot.getGeneratedAt());
        assertEquals("", snapshot.getTimezone());
        assertEquals(2, snapshot.getEntries().size());
    }

    /**
     * 用索引交换两条 entry 的顺序。
     *
     * 直接把字符串倒过来写更易读，但那样一改夹具就得同步改两处，容易失配。
     *
     * @param payload 原始合法负载。
     * @return 两条 entry 顺序被交换后的负载。
     */
    private static String reorderEntries(String payload) {
        int entriesStart = payload.indexOf("\"entries\":[") + "\"entries\":[".length();
        // separator 指向两条 entry 之间的那个逗号，交换时把它排除在外，避免拼出 "],,{..." 这种非法 JSON。
        int separator = payload.indexOf("},", entriesStart) + 1;
        int entriesEnd = payload.lastIndexOf("]}");

        String first = payload.substring(entriesStart, separator);
        String second = payload.substring(separator + 1, entriesEnd);
        return payload.substring(0, entriesStart) + second + "," + first + payload.substring(entriesEnd);
    }

    /**
     * 字面替换，用于从合法负载派生各种破损负载。
     *
     * @param source 原字符串。
     * @param target 待替换片段。
     * @param replacement 替换结果。
     * @return 替换后的字符串；未命中时断言失败，避免测试静默失效。
     */
    private static String replace(String source, String target, String replacement) {
        if (!source.contains(target)) {
            throw new IllegalArgumentException("fixture mismatch: " + target);
        }
        return source.replace(target, replacement);
    }

    @Test
    public void parserNeverThrowsOnHostileInput() {
        // 覆盖一批形状奇怪的输入，确保契约是「返回 null」而不是抛异常。
        String[] hostile = { "{", "}", "null", "true", "0", "\"string\"", "[]", "{\"schemaVersion\":null}",
                "{\"schemaVersion\":1,\"status\":\"ok\",\"entries\":[],\"dayEndEpochMs\":[]}", "{\"status\":\"ok\"}" };

        for (String candidate : hostile) {
            WidgetSnapshot parsed = WidgetSnapshotParser.parse(candidate);
            if (parsed != null) {
                // 唯一允许通过的形状是「字段齐全且两个数组都为空」。
                assertEquals(String.format(Locale.ROOT, "unexpected acceptance for %s", candidate), 0, parsed.getEntries().size());
                assertEquals(0, parsed.getDayEndEpochMs().size());
            }
        }
    }
}
