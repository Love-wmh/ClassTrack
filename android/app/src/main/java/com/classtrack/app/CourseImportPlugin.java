package com.classtrack.app;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;

@CapacitorPlugin(name = "CourseImport")
public class CourseImportPlugin extends Plugin {
    private static final String ADAPTER_ID = "tianjin-university-of-technology";
    private static final String EXTRA_ADAPTER_ID = "adapterId";
    private static final String EXTRA_TERM = "term";
    private static final String EXTRA_FIRST_WEEK_START_DATE = "firstWeekStartDate";
    private static final String EXTRA_RESULT_FILE = "resultFile";
    private static final String EXTRA_SOURCE_URL = "sourceUrl";
    private boolean activityInProgress;

    @PluginMethod
    public void open(PluginCall call) {
        if (activityInProgress) {
            call.reject("应用内导入正在进行中，请先返回当前页面", "CANCELLED");
            return;
        }
        String adapterId = call.getString("adapterId");
        String url = call.getString("url");
        String term = call.getString("term");
        String firstWeekStartDate = call.getString("firstWeekStartDate");

        if (!ADAPTER_ID.equals(adapterId)) {
            call.reject("不支持的课程导入适配器", "INVALID_ADAPTER");
            return;
        }
        if (!ScheduleResponseValidator.ENTRY_URL.equals(url) || !CourseImportNavigationPolicy.isAllowedNavigationUrl(url)) {
            call.reject("课程导入网址不在允许范围内", "INVALID_URL");
            return;
        }
        if (term == null || !term.matches("\\d{4}-\\d{4}-[12]")) {
            call.reject("学年学期代码格式无效", "INVALID_ADAPTER");
            return;
        }
        if (firstWeekStartDate == null || !firstWeekStartDate.matches("\\d{4}-\\d{2}-\\d{2}")) {
            call.reject("第一周日期格式无效", "INVALID_ADAPTER");
            return;
        }

        Intent intent = new Intent(getActivity(), CourseImportActivity.class);
        intent.putExtra(EXTRA_ADAPTER_ID, adapterId);
        intent.putExtra(EXTRA_TERM, term);
        intent.putExtra(EXTRA_FIRST_WEEK_START_DATE, firstWeekStartDate);
        activityInProgress = true;
        try {
            startActivityForResult(call, intent, "handleImportResult");
        } catch (Exception ignored) {
            activityInProgress = false;
            call.reject("应用内导入启动失败，请改用 JSON/书签脚本导入", "NETWORK_ERROR");
        }
    }

    @ActivityCallback
    public void handleImportResult(PluginCall call, ActivityResult result) {
        activityInProgress = false;
        Intent data = result == null ? null : result.getData();
        String path = data == null ? null : data.getStringExtra(EXTRA_RESULT_FILE);
        if (call == null) {
            deletePrivateResultFile(path);
            return;
        }
        if (data == null) {
            call.reject("已取消应用内导入", "CANCELLED");
            return;
        }
        try {
            if (result.getResultCode() != Activity.RESULT_OK) {
                rejectActivityError(call, data);
                return;
            }

            String sourceUrl = CourseImportNavigationPolicy.safeUrlForResult(data.getStringExtra(EXTRA_SOURCE_URL));
            if (path == null || sourceUrl == null) {
                call.reject("课表响应文件不存在", "PAYLOAD_READ_FAILED");
                return;
            }
            if (!isPrivateResultFile(path)) {
                call.reject("课表响应文件位置无效", "PAYLOAD_READ_FAILED");
                return;
            }

            File resultFile = new File(path);
            if (!resultFile.isFile()) {
                call.reject("课表响应文件不存在", "PAYLOAD_READ_FAILED");
                return;
            }
            if (resultFile.length() > ScheduleResponseValidator.MAX_PAYLOAD_BYTES) {
                call.reject("课表响应超过大小限制", "PAYLOAD_TOO_LARGE");
                return;
            }

            String body = readFile(resultFile);
            if (!ScheduleResponseValidator.isValidTargetResponse(sourceUrl, sourceUrl, body)) {
                call.reject("未找到有效课表响应", "NOT_LOGGED_IN_OR_NO_SCHEDULE");
                return;
            }

            JSObject response = new JSObject();
            response.put("data", body);
            response.put("sourceUrl", sourceUrl);
            response.put("term", data.getStringExtra(EXTRA_TERM));
            response.put("firstWeekStartDate", data.getStringExtra(EXTRA_FIRST_WEEK_START_DATE));
            call.resolve(response);
        } catch (Exception ignored) {
            call.reject("读取课表响应失败", "PAYLOAD_READ_FAILED");
        } finally {
            deletePrivateResultFile(path);
        }
    }

    private boolean isPrivateResultFile(String path) {
        try {
            File cacheDir = getActivity().getCacheDir().getCanonicalFile();
            File resultFile = new File(path).getCanonicalFile();
            return resultFile.toPath().startsWith(cacheDir.toPath());
        } catch (Exception ignored) {
            return false;
        }
    }

    private void deletePrivateResultFile(String path) {
        if (path == null || !isPrivateResultFile(path)) return;
        //noinspection ResultOfMethodCallIgnored
        new File(path).delete();
    }

    private void rejectActivityError(PluginCall call, Intent data) {
        String errorCode = data.getStringExtra("errorCode");
        String errorMessage = data.getStringExtra("errorMessage");
        if ("INVALID_ADAPTER".equals(errorCode)
                || "INVALID_URL".equals(errorCode)
                || "NETWORK_ERROR".equals(errorCode)
                || "NOT_LOGGED_IN_OR_NO_SCHEDULE".equals(errorCode)
                || "PAYLOAD_TOO_LARGE".equals(errorCode)
                || "PAYLOAD_READ_FAILED".equals(errorCode)) {
            call.reject(errorMessage == null ? "应用内导入失败" : errorMessage, errorCode);
            return;
        }
        call.reject("已取消应用内导入", "CANCELLED");
    }

    private String readFile(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                if (output.size() > ScheduleResponseValidator.MAX_PAYLOAD_BYTES) {
                    throw new IllegalStateException("payload too large");
                }
            }
            return output.toString(java.nio.charset.StandardCharsets.UTF_8.name());
        }
    }
}
