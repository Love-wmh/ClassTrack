# Native Course Import Contract

## Scenario: Android in-app import for JinZhi schedules

### 1. Scope / Trigger

Use this contract when changing the Android Capacitor bridge, the in-app import flow, the dual-WebView shell, or adding another school adapter that captures a logged-in academic-system response. The first adapter is Tianjin University of Technology (`tianjin-university-of-technology`). Browser/PWA code must continue using the existing bookmarklet, JSON-upload, and backup paths.

The native flow uses one `CourseImportActivity`, a local React/shadcn shell WebView, a restricted academic WebView, and a native session controller. Java owns WebView/container/lifecycle/security boundaries; ClassTrack-owned visual UI remains React-rendered.

### 2. Signatures

The web/native boundary is registered as `CourseImport`:

```ts
interface CourseImportOpenOptions {
  adapterId: string
  url: string
  term: string // /^\d{4}-\d{4}-[12]$/
  firstWeekStartDate?: string // /^\d{4}-\d{2}-\d{2}$/
}

interface CourseImportResult {
  data: string // validated JSON passed to the existing parser only
  sourceUrl: string // HTTPS target path without query/fragment
  term?: string
  firstWeekStartDate?: string
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

The Android validator uses `TARGET_HOST = 'jwxt.tjut.edu.cn'`, the exact endpoint path above, and `MAX_PAYLOAD_BYTES = 512 * 1024`.

The local shell accepts only these fixed commands:

```text
ready()
resize(heightCssPx)
startAcademic(term, firstWeekStartDate)
retry()
refreshAcademic()
back()
requestImport()
cancel()
```

The native-to-shell state contains only fixed safe fields:

```ts
type CourseImportShellState = {
  state: 'IDLE' | 'ACADEMIC_LOADING' | 'ACADEMIC_READY' | 'CAPTURE_WAITING'
    | 'CAPTURED' | 'HANDING_OFF' | 'ERROR' | 'CANCELLED'
  messageKey: string
  errorCode: CourseImportErrorCode | null
  term: string
  firstWeekStartDate: string | null
  canRetry: boolean
  canRefresh: boolean
  canImport: boolean
  contentSlotActive: boolean
}
```

### 3. Contracts

- `open` is available only when `Capacitor.getPlatform() === 'android'` and the `CourseImport` native plugin is registered. The Web implementation rejects with `UNAVAILABLE`; it never attempts cross-origin capture.
- Android accepts only the registered adapter, the exact HTTPS entry URL, a valid term, and a valid first-week date. The Activity repeats boundary validation.
- The shell WebView loads the packaged React asset at `https://appassets.androidplatform.net/index.html?native-shell=1` through `WebViewAssetLoader`. It must not use `file://`, `loadData`, arbitrary remote URLs, or a Java copy of shadcn markup.
- The academic WebView is a separate instance and bridge. It owns login, CAPTCHA, menu navigation, same-origin requests, and the capture hook. It never receives the shell bridge or Capacitor bridge.
- The navigation allowlist is separate from capture validation. For the current adapter it allows only HTTPS, default/443 port, no userinfo, host `jwxt.tjut.edu.cn`, and explicitly configured path prefixes `/jwapp/sys/wdkb` and `/authserver`. Unknown paths, HTTP, `intent:`, `file:`, `content:`, external hosts, non-default ports, and userinfo are blocked. A new CAS host/path may be added only after redacted device evidence and as an explicit entry; never use wildcard hosts or paths.
- The capture allowlist remains narrower and cannot be widened by navigation changes: HTTPS, host `jwxt.tjut.edu.cn`, default/443 port, exact endpoint path `/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do`, allowed current top-level page, payload no larger than 512 KiB, and JSON markers `datas.cxxszhxqkb.rows` with a non-empty first-row `KCM`.
- `ScheduleCaptureScript` captures only matching XHR/fetch response candidates. It is idempotent across page-finish reinjection, uses a session nonce, and reports oversized candidates without sending their body. Native repeats URL, current-page, nonce, size, and JSON validation.
- React shell state never contains raw URL, response body, Cookie, Authorization, credentials, form fields, arbitrary script, endpoint, or navigation target. The raw response travels only through the existing private cache-file → Capacitor plugin → parser/`importClasses` boundary after the user requests import.
- The Activity writes accepted data to `cacheDir` only for the handoff. `CourseImportPlugin` verifies the canonical path is inside the private cache directory, enforces the size limit, validates the response again, and deletes the file in every path that receives one.
- Diagnostics use one fixed tag and emit only phase/category, safe scheme/host/path, frame flag, status/error enum, byte length, state, and booleans. Query, fragment, userinfo, credentials, cookies, authorization, form values, exception text, response body, and raw JSON must never be logged.
- The shell/content slot is fixed-content-slot first: when academic content is active, the shell reports natural chrome height and native places academic WebView below it; the shell must not be a transparent full-screen touch interceptor. Initial/error/cancelled states hide academic WebView and let shell fill the Activity. If device verification proves rotation, IME, font scale, or insets cannot keep the slot stable, record the explicit visibility-switching downgrade rather than claiming strict persistent-chrome compliance.
- WebView destruction must be ordered: invalidate session and callbacks, stop loading, remove JS interfaces and clients, detach from the parent, then call `destroy()`. Both WebViews use the same sequence.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Web/PWA or missing native plugin | Hide `native-webview`; keep parser, bookmarklet, JSON, and backup methods available. |
| Unknown adapter, non-exact entry URL, invalid term/date | Reject with `INVALID_ADAPTER` or `INVALID_URL`; do not start a usable Activity session. |
| HTTP, unknown host/path, non-default port, userinfo, or non-web scheme | Block main-frame navigation, log a redacted reason, and show recoverable `INVALID_URL`. |
| Allowed login/app page | Return `false` from `shouldOverrideUrlLoading`; keep the same academic WebView session and show loading/ready state. |
| Main-frame HTTP/SSL/network failure | Cancel unsafe SSL load, report `NETWORK_ERROR`, keep shell error and retry/refresh/back controls visible. Subresource failures must not fail the whole page. |
| Login HTML, unrelated payload, invalid JSON, empty rows, or missing `KCM` | Do not capture; after request timeout report `NOT_LOGGED_IN_OR_NO_SCHEDULE`. |
| Target response over 512 KiB | Report `PAYLOAD_TOO_LARGE` without passing the body through the bridge. |
| Invalid private-file path, missing file, or read/validation failure | Reject with `PAYLOAD_READ_FAILED`/`PAYLOAD_TOO_LARGE`, delete any private temporary file. |
| User presses back/cancels | Clear candidate and timeout; finish with `CANCELLED`; never retain captured data in shell or storage. |
| Parser cannot decode valid JSON or produces no classes | Report `PARSE_ERROR`; do not write partial course data. |
| Activity destruction/retry/rotation | Invalidate old callbacks and clean WebViews in detach-before-destroy order; do not claim process-death auto-recovery. |

Supported business error codes are `UNAVAILABLE`, `CANCELLED`, `INVALID_ADAPTER`, `INVALID_URL`, `NOT_LOGGED_IN_OR_NO_SCHEDULE`, `NETWORK_ERROR`, `PAYLOAD_TOO_LARGE`, `PAYLOAD_READ_FAILED`, and `PARSE_ERROR`.

### 5. Good / Base / Bad Cases

- **Good**: Android user selects Tianjin University of Technology, chooses a valid term and first-week date, logs in inside the restricted WebView, opens the schedule page, and imports a validated response. Existing parser/store code creates the same `Class[]`, semester state, current week, and historical marks as JSON import.
- **Base**: Browser user sees no native option and continues with the existing bookmarklet/JSON or backup import flow. Android users can return to those methods after a recoverable native error.
- **Bad**: A URL supplied by a page or JavaScript bridge is trusted because it came from a WebView; an arbitrary host/path is added to fix a white screen; or Java logs the raw error URL/body. Native must re-check scheme, host, port, configured navigation path, exact capture path, nonce, size, and JSON markers at the boundary.

### 6. Tests Required

- TypeScript tests must assert adapter lookup, Web unavailable behavior, error mapping, term/date validation, shell state shape, and that URL/body-shaped shell fields are rejected.
- React tests must cover the shared shell's idle, ready, captured, failed, and recovery-action markup, including responsive active content-slot behavior and shadcn component reuse.
- Android unit tests must assert navigation HTTPS/host/port/userinfo/path filtering, auth navigation not expanding capture, safe URL projection without query/fragment, accepted schedule markers, HTML/empty rows/invalid JSON/oversized payload rejection, diagnostics category sanitization, and capture-script idempotent XHR/fetch/nonce/target behavior.
- Android/instrumentation tests or a device matrix must cover asset `ready`, real login/CAS/CAPTCHA, schedule navigation, shell touch/content-slot bounds, refresh, timeout, retry, back, cancel, rotation, IME, font scale, lifecycle cleanup, and real parser output.
- Use `pnpm test`, `pnpm typecheck`, local project ESLint 10, `pnpm format:check`, `pnpm build`, `pnpm cap:sync:android`, Android Gradle tests/builds, and `git diff --check`. If Android tooling or a device is unavailable, record the exact blocker; frontend checks cannot substitute for device acceptance.

### 7. Wrong vs Correct

#### Wrong

```ts
// Do not make the ClassTrack shell fetch or parse the academic endpoint.
await fetch('https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do')

// Do not let a native bridge command choose an arbitrary URL or script.
window.CourseImportShell?.loadUrl(userInput)
```

#### Correct

```ts
// The academic WebView owns the logged-in request; the existing parser remains
// the only consumer of the validated result returned by the native plugin.
const result = await courseImportPlugin.open({ adapterId, url: entryUrl, term, firstWeekStartDate })
const classes = importClasses(JSON.parse(result.data), parser.parse, {
  firstWeekStartDate: result.firstWeekStartDate ?? firstWeekStartDate,
})
```

The same host/path, nonce, payload-size, JSON-marker, private-file, and lifecycle validation must run in native code; React and WebView origin checks are not security boundaries.
