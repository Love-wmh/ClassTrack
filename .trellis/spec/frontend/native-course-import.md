# Native Course Import Contract

## Scenario: Android in-app import for JinZhi schedules

### 1. Scope / Trigger

Use this contract when changing the Android Capacitor bridge, the in-app import step, or adding another school adapter that captures a logged-in academic-system response. The first adapter is Tianjin University of Technology (`tianjin-university-of-technology`). Browser/PWA code must continue using the existing bookmarklet and JSON-upload paths.

### 2. Signatures

The web/native boundary is registered as `CourseImport`:

```ts
interface CourseImportOpenOptions {
  adapterId: string
  url: string
  term: string
}

interface CourseImportResult {
  data: string
  sourceUrl: string
}

interface CourseImportPlugin {
  open(options: CourseImportOpenOptions): Promise<CourseImportResult>
}
```

The current adapter contract is:

```ts
{
  adapterId: 'tianjin-university-of-technology',
  schoolId: 'tianjin-university-of-technology',
  entryUrl: 'https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do',
  endpointPath: '/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do'
}
```

The Android validator uses `TARGET_HOST = 'jwxt.tjut.edu.cn'`, the endpoint path above, and `MAX_PAYLOAD_BYTES = 512 * 1024`.

### 3. Contracts

- `open` is available only when `Capacitor.getPlatform() === 'android'` and the `CourseImport` native plugin is registered. The Web implementation rejects with `UNAVAILABLE`; it must not pretend to capture cross-origin content.
- Android accepts only the registered adapter, the exact HTTPS entry URL, a term matching `\\d{4}-\\d{4}-[12]`, and URLs on the configured host with no user info and no non-default port.
- The WebView may return only a target endpoint response whose URL is HTTPS, uses the configured host/path, is no larger than 512 KiB, and parses as JSON containing `datas.cxxszhxqkb.rows` with a non-empty first-row `KCM`.
- The page hook captures only the target XHR/fetch response. It must be idempotent across `onPageFinished` reinjection and must not log or return credentials, cookies, authorization headers, form fields, or unrelated response bodies.
- The Activity writes an accepted response to an app-private cache file only after the user requests import. The Capacitor callback reads and deletes that file in all result paths; the TypeScript layer passes the raw JSON to the existing parser and `importClasses` function without persisting the raw response.
- Supported error codes are `UNAVAILABLE`, `CANCELLED`, `INVALID_ADAPTER`, `INVALID_URL`, `NOT_LOGGED_IN_OR_NO_SCHEDULE`, `NETWORK_ERROR`, `PAYLOAD_TOO_LARGE`, `PAYLOAD_READ_FAILED`, and `PARSE_ERROR`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Web/PWA or missing native plugin | Hide `native-webview`; keep parser, bookmarklet, and backup methods available. |
| Unknown adapter or non-exact entry URL | Reject with `INVALID_ADAPTER` or `INVALID_URL`; do not start an Activity. |
| Non-HTTPS, wrong host, user info, or non-default port | Reject navigation/response and never pass it to JavaScript. |
| Login page, HTML, missing markers, empty rows, or missing `KCM` | Do not capture; after retry timeout report `NOT_LOGGED_IN_OR_NO_SCHEDULE`. |
| Response over 512 KiB or invalid private-file path | Reject with `PAYLOAD_TOO_LARGE`/`PAYLOAD_READ_FAILED` and remove any private temporary file. |
| User presses back/cancels | Reject with `CANCELLED`; do not retain the captured response. |
| Parser cannot decode valid JSON or produces no classes | Report `PARSE_ERROR`; do not write partial course data. |
| Network or SSL failure in the main frame/request | Report `NETWORK_ERROR` and allow refresh/retry. |

### 5. Good / Base / Bad Cases

- **Good**: Android user selects Tianjin University of Technology, chooses a valid term and first-week date, logs in inside the restricted WebView, opens the schedule page, and imports a validated response. Existing parser/store code creates the same `Class[]`, semester state, and historical marks as JSON import.
- **Base**: Browser user sees no native option and continues with the existing bookmarklet/JSON or backup import flow.
- **Bad**: A URL supplied by the page or JavaScript bridge is trusted because it came from a WebView. The native validator must re-check host, scheme, port, path, payload size, and JSON markers at the boundary.

### 6. Tests Required

- TypeScript tests must assert adapter lookup, native availability behavior on Web, and every user-visible error mapping that affects recovery.
- Android unit tests must assert HTTPS/host/port/user-info/path filtering, accepted schedule markers, rejection of HTML/empty rows/oversized payloads, and that the capture script contains an idempotent XHR/fetch hook and the configured bridge/path.
- Any new adapter must add tests for its exact entry URL, endpoint path, term validation, payload markers, and fallback behavior before exposing `native-webview` in the UI.
- Manual Android verification remains necessary for login redirects, CAPTCHA, schedule navigation, Activity back/refresh, rotation, retry, and real parser output because those depend on the university service.

### 7. Wrong vs Correct

#### Wrong

```ts
// Cross-origin fetch from the ClassTrack page cannot reuse the academic system's login session.
await fetch('https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do')
```

#### Correct

```ts
// Ask the project-owned Android WebView to issue/capture the request in its
// academic-system page context, then reuse the existing parser boundary.
const result = await courseImportPlugin.open({ adapterId, url: entryUrl, term })
const classes = importClasses(JSON.parse(result.data), parser.parse, { firstWeekStartDate })
```

The same host/path and payload validation must still run in native code; the web layer is not a security boundary.
