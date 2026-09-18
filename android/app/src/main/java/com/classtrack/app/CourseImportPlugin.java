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

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;

@CapacitorPlugin(name = "CourseImport")
public class CourseImportPlugin extends Plugin {
    private static final String ADAPTER_ID = "tianjin-university-of-technology";
    private static final String EXTRA_TERM = "term";
    private static final String EXTRA_RESULT_FILE = "resultFile";
    private static final String EXTRA_SOURCE_URL = "sourceUrl";

    @PluginMethod
    public void open(PluginCall call) {
        String adapterId = call.getString("adapterId");
        String url = call.getString("url");
        String term = call.getString("term");

        if (!ADAPTER_ID.equals(adapterId)) {
            call.reject("不支持的课程导入适配器", "INVALID_ADAPTER");
            return;
        }
        if (!ScheduleResponseValidator.ENTRY_URL.equals(url) || !ScheduleResponseValidator.isAllowedPageUrl(url)) {
            call.reject("课程导入网址不在允许范围内", "INVALID_URL");
            return;
        }
        if (term == null || !term.matches("\\d{4}-\\d{4}-[12]")) {
            call.reject("学年学期代码格式无效", "INVALID_ADAPTER");
            return;
        }

        Intent intent = new Intent(getActivity(), CourseImportActivity.class);
        intent.putExtra(EXTRA_TERM, term);
        startActivityForResult(call, intent, "handleImportResult");
    }

    @ActivityCallback
    public void handleImportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getData() == null) {
            call.reject("已取消应用内导入", "CANCELLED");
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK) {
            rejectActivityError(call, data);
            return;
        }

        String path = data.getStringExtra(EXTRA_RESULT_FILE);
        String sourceUrl = data.getStringExtra(EXTRA_SOURCE_URL);
        if (path == null || sourceUrl == null || !ScheduleResponseValidator.isAllowedPageUrl(sourceUrl)) {
            if (path != null && isPrivateResultFile(path)) {
                //noinspection ResultOfMethodCallIgnored
                new File(path).delete();
            }
            call.reject("课表响应文件不存在", "PAYLOAD_READ_FAILED");
            return;
        }

        if (!isPrivateResultFile(path)) {
            call.reject("课表响应文件位置无效", "PAYLOAD_READ_FAILED");
            return;
        }

        File resultFile = new File(path);
        try {
            if (!resultFile.isFile() || resultFile.length() > ScheduleResponseValidator.MAX_PAYLOAD_BYTES) {
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
            call.resolve(response);
        } catch (Exception exception) {
            call.reject("读取课表响应失败", "PAYLOAD_READ_FAILED", exception);
        } finally {
            // The original response is never retained after this bridge callback.
            //noinspection ResultOfMethodCallIgnored
            resultFile.delete();
        }
    }

    private boolean isPrivateResultFile(String path) {
        try {
            File cacheDir = getActivity().getCacheDir().getCanonicalFile();
            File resultFile = new File(path).getCanonicalFile();
            return resultFile.toPath().startsWith(cacheDir.toPath());
        } catch (Exception exception) {
            return false;
        }
    }

    private void rejectActivityError(PluginCall call, Intent data) {
        String errorCode = data.getStringExtra("errorCode");
        String errorMessage = data.getStringExtra("errorMessage");
        if ("INVALID_ADAPTER".equals(errorCode)
                || "INVALID_URL".equals(errorCode)
                || "NETWORK_ERROR".equals(errorCode)
                || "NOT_LOGGED_IN_OR_NO_SCHEDULE".equals(errorCode)) {
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
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
