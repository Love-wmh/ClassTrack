/**
 * 应用版本号的解析与比较。
 *
 * 版本号有两条来源，格式由 `.github/workflows/android-release.yml` 决定：
 * - 正式版：`X.Y.Z`（tag `vX.Y.Z`）
 * - 测试版：`1.0.<序号>-beta`（tag `android-beta-<序号>`）
 * - 本机签名包：`1.0.0-local`（见 README「发布与签名」）
 *
 * 这套规则是**跨层契约**：版本号由 CI 生成、由 `build.gradle` 写进 APK、由 `@capacitor/app`
 * 在运行期读回。任何一侧改了命名，这里就会判错「有没有新版本」。
 */

export type AppVersion = {
  major: number
  minor: number
  patch: number
  /** prerelease 标识（`beta` / `local`）；正式版为 `null`。 */
  prerelease: string | null
}

/** 只认 `[v]X.Y.Z[-标识]`，不接受 `1.0`、`1.0.10.1`、`1.0b` 这类形态。 */
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/

/**
 * 解析版本号。
 *
 * @param input 版本名或 tag，例如 `1.0.10-beta` / `v1.2.0` / `1.0.0-local`。
 * @returns 解析结果；不符合 `[v]X.Y.Z[-标识]` 时返回 `null`，由调用方决定跳过还是报错。
 */
export function parseAppVersion(input: string): AppVersion | null {
  const matched = VERSION_PATTERN.exec(input.trim())
  if (!matched) return null

  return {
    major: Number(matched[1]),
    minor: Number(matched[2]),
    patch: Number(matched[3]),
    prerelease: matched[4] ?? null,
  }
}

/**
 * 把版本号归一化成 `X.Y.Z[-标识]`（去掉可能存在的 `v` 前缀）。
 *
 * @param input 版本名或 tag。
 * @returns 归一化后的版本号；无法解析时返回 `null`。
 */
export function normalizeAppVersion(input: string): string | null {
  const parsed = parseAppVersion(input)
  if (!parsed) return null

  const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  return parsed.prerelease ? `${core}-${parsed.prerelease}` : core
}

/**
 * 比较两个版本。
 *
 * 规则（prd「版本解析与比较规则」）：
 * 1. 三元组**按数值**逐位比较，所以 `1.0.10` 比 `1.0.9` 新（字符串比较会得出相反结论）；
 * 2. 三元组完全相同时，无 prerelease 标识的更新（`1.0.10` > `1.0.10-beta`）；
 * 3. 两边都带标识且三元组相同时视为相等 —— 本项目的测试版标识本身不带序号，
 *    测试版之间的先后完全由三元组承载（`1.0.11-beta` > `1.0.10-beta`）。
 *
 * @returns `a` 更新返回正数，`b` 更新返回负数，相等返回 `0`。
 */
export function compareAppVersions(a: AppVersion, b: AppVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === null) return 1
  if (b.prerelease === null) return -1
  return 0
}

/**
 * 比较两个版本字符串，供排序/取最大值的场景直接使用。
 *
 * 远端数据可能带来无法解析的版本号：这里把它当作**比任何合法版本都旧**而不是抛错，
 * 这样一条脏候选不会让整轮检查失败。
 */
export function compareVersionStrings(a: string, b: string): number {
  const parsedA = parseAppVersion(a)
  const parsedB = parseAppVersion(b)

  if (!parsedA && !parsedB) return 0
  if (!parsedA) return -1
  if (!parsedB) return 1
  return compareAppVersions(parsedA, parsedB)
}

/**
 * 候选版本是不是严格比当前版本新。
 *
 * @param candidate 候选版本号（来自 release）。
 * @param current 当前安装的版本名（来自 `App.getInfo()`）。
 * @returns 任一侧解析失败时返回 `false` —— 「判不出来」不能当成「有新版本」。
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parsedCandidate = parseAppVersion(candidate)
  const parsedCurrent = parseAppVersion(current)
  if (!parsedCandidate || !parsedCurrent) return false

  return compareAppVersions(parsedCandidate, parsedCurrent) > 0
}

/**
 * 当前安装包是不是**测试版包**。
 *
 * 判据就是「版本名有没有 `-` 后缀」：正式版是纯 `X.Y.Z`，测试版是 `1.0.10-beta`，
 * 本机签名包是 `1.0.0-local`。它只在**首次播种更新通道**时用一次
 * （见 `channels.ts` 的 `seedChannel`），播种之后通道不再看安装包类型。
 *
 * 注意本地 debug 包的版本名是 `1.0`，会被判成正式版包 —— 这是可接受的：
 * debug 包不对外分发，且用户能在设置里改通道。
 */
export function isPrereleaseBuild(versionName: string): boolean {
  const trimmed = versionName.trim()
  return trimmed.includes('-') && parseAppVersion(trimmed) !== null
}
