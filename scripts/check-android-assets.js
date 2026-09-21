import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_DIR = join(ROOT_DIR, 'build', 'client')
const SYNCED_ASSETS_DIR = join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public')
const DEFAULT_APK_PATH = join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const APK_ASSET_PREFIX = 'assets/public/'
const SHELL_ORIGIN = 'https://appassets.androidplatform.net'
const SHELL_URL_SOURCE = join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'com', 'classtrack', 'app', 'CourseImportShellUrl.java')
const ROUTES_SOURCE = join(ROOT_DIR, 'app', 'routes.ts')
const MAX_UNZIP_OUTPUT_BYTES = 32 * 1024 * 1024

// 小工具 provider 的期望清单：格子数 → 元数据文件里的 targetCellWidth/Height。
// 七档各一个 provider（2026-09-21 维护面收缩：两档维护 + 五档收起），任何一处写歪都会让
// "某个尺寸放下去是错的样式" 这种极难复现的问题流出去，所以在这里与清单一起断言。
// 顺序 = WidgetProviderRegistry 的声明顺序（维护档在前）。
const WIDGET_PROVIDER_CELLS = {
  '3x2': [3, 2],
  '1x2': [1, 2],
  '4x3': [4, 3],
  '2x2': [2, 2],
  '2x3': [2, 3],
  '4x2': [4, 2],
  '6x3': [6, 3],
}

// 维护档：只有这两档会出现在系统拾取器里（其余档的 receiver 在应用启动时被禁用）。
// 必须与注册表里的 `maintained` 标记严格对应 —— 多一档会在拾取器里多一条，少一档会少一条。
const MAINTAINED_WIDGET_CELLS = ['3x2', '1x2']

function sha256File(filePath) {
  return createHash('sha256').update(readAssetFile(filePath)).digest('hex')
}
function readAssetFile(filePath) {
  try {
    return readFileSync(filePath)
  } catch {
    throw new Error('unable to read asset file')
  }
}
export function collectLocalAssetReferences(indexHtml) {
  const references = new Set()
  const addReference = (value) => {
    if (!value || value.startsWith('#')) return

    let url
    try {
      url = new URL(value, `${SHELL_ORIGIN}/index.html`)
    } catch {
      throw new Error('invalid shell asset reference')
    }

    if (url.origin !== SHELL_ORIGIN) {
      throw new Error('non-local shell asset reference')
    }

    const pathname = url.pathname.replace(/^\/+/, '')
    if (!pathname || pathname.endsWith('/')) return
    references.add(pathname)
  }

  const attributePattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi
  for (const match of indexHtml.matchAll(attributePattern)) addReference(match[1])

  const inlineScriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  const moduleImportPatterns = [/\bimport\s*(?:\(\s*)?["']([^"']+)["']/g, /\bimport\s+[^'"]*?\sfrom\s+["']([^"']+)["']/g]
  for (const scriptMatch of indexHtml.matchAll(inlineScriptPattern)) {
    for (const importPattern of moduleImportPatterns) {
      for (const importMatch of scriptMatch[1].matchAll(importPattern)) addReference(importMatch[1])
    }
  }

  return [...references].sort()
}

export function readAssetDirectory(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error('asset directory does not exist')
  }

  const files = new Map()
  const visit = (currentDirectory) => {
    let entries
    try {
      entries = readdirSync(currentDirectory, { withFileTypes: true })
    } catch {
      throw new Error('unable to read asset directory')
    }
    for (const entry of entries) {
      const absolutePath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`unsupported asset entry: ${relative(directory, absolutePath)}`)
      }

      const assetPath = relative(directory, absolutePath).split(sep).join('/')
      files.set(assetPath, readAssetFile(absolutePath))
    }
  }

  visit(directory)
  return files
}

export function assertNativeShellContract({ shellUrlSource = SHELL_URL_SOURCE, routesSource = ROUTES_SOURCE } = {}) {
  const shellSource = readFileSync(shellUrlSource, 'utf8')
  const routesSourceText = readFileSync(routesSource, 'utf8')

  if (!/SHELL_BOOT_PATH\s*=\s*["']\/["']/.test(shellSource)) {
    throw new Error('native shell boot path must be the root route')
  }
  if (/SHELL_URL[^;]*\.html/.test(shellSource)) {
    throw new Error('native shell URL must not use a static HTML path')
  }
  if (!/\bindex\s*\(/.test(routesSourceText)) {
    throw new Error('native shell boot path must match the index route')
  }
}

/**
 * 五份小工具元数据 + 清单里的五条 receiver 必须一一对应。
 *
 * 为什么不看 APK 里的二进制 XML：`targetCell*` 会被编进二进制资源，正则解析不可靠；而这些值直接决定
 * 拾取器显示的尺寸，因此改为在源码/资源层面断言（清单与 res/xml 都在仓库里，且是同一份提交）。
 */
export function assertWidgetProviders({
  xmlDir = join(ROOT_DIR, 'android/app/src/main/res/xml'),
  manifestPath = join(ROOT_DIR, 'android/app/src/main/AndroidManifest.xml'),
} = {}) {
  const manifest = readFileSync(manifestPath, 'utf8')

  for (const [cells, [expectedWidth, expectedHeight]] of Object.entries(WIDGET_PROVIDER_CELLS)) {
    const infoPath = join(xmlDir, `widget_info_${cells}.xml`)
    if (!existsSync(infoPath)) throw new Error(`missing widget provider metadata: widget_info_${cells}.xml`)

    const info = readFileSync(infoPath, 'utf8')
    const width = Number((info.match(/android:targetCellWidth="(\d+)"/) || [])[1])
    const height = Number((info.match(/android:targetCellHeight="(\d+)"/) || [])[1])
    if (width !== expectedWidth || height !== expectedHeight) {
      throw new Error(`widget_info_${cells}.xml declares ${width}x${height}, expected ${expectedWidth}x${expectedHeight}`)
    }
    if (!info.includes(`@layout/widget_preview_${cells}`) || !info.includes(`@drawable/widget_preview_${cells}`)) {
      throw new Error(`widget_info_${cells}.xml must point at its own preview layout and image`)
    }
    if (!manifest.includes(`@xml/widget_info_${cells}`)) {
      throw new Error(`AndroidManifest.xml does not register the ${cells} widget provider`)
    }
  }

  // 旧类名必须还在：改名会让桌面上已有的实例全部失效（系统按组件名找回 provider）。
  if (!manifest.includes('android:name=".widget.ClassTrackWidgetReceiver"')) {
    throw new Error('AndroidManifest.xml lost the legacy ClassTrackWidgetReceiver (existing widgets would break)')
  }
  const receiverCount = (manifest.match(/android.appwidget.action.APPWIDGET_UPDATE/g) || []).length
  if (receiverCount !== 7) {
    throw new Error(`manifest declares ${receiverCount} APPWIDGET_UPDATE receivers, expected 7`)
  }

  // 注册表是「哪些档是维护档」的唯一真相源：启动时的禁用清单由它推导，所以这里断言三件事 ——
  // ①条目顺序与元数据清单一致 ②维护档恰好是那两档 ③每条非维护条目都真的在清单里。
  // ③ 很关键：漏一条就不会被禁用，拾取器里就会多出一条，而漏掉的往往是改名或新增档位时忘了改标记。
  const registry = readFileSync(join(ROOT_DIR, 'android/app/src/main/java/com/classtrack/app/WidgetProviderRegistry.java'), 'utf8')
  const registered = [...registry.matchAll(/new Entry\(PACKAGE \+ "(\w+)", WidgetPreset\.ID_CELL_(\w+), (true|false)\)/g)].map((match) => ({
    receiver: match[1],
    cells: match[2].toLowerCase(),
    maintained: match[3] === 'true',
  }))
  const expectedCells = Object.keys(WIDGET_PROVIDER_CELLS)
  if (registered.map((entry) => entry.cells).join(',') !== expectedCells.join(',')) {
    throw new Error(
      `WidgetProviderRegistry order [${registered.map((entry) => entry.cells).join(', ')}] != expected [${expectedCells.join(', ')}]`
    )
  }
  const maintained = registered.filter((entry) => entry.maintained).map((entry) => entry.cells)
  if (maintained.join(',') !== MAINTAINED_WIDGET_CELLS.join(',')) {
    throw new Error(
      `WidgetProviderRegistry marks [${maintained.join(', ')}] as maintained, expected [${MAINTAINED_WIDGET_CELLS.join(', ')}]`
    )
  }
  for (const entry of registered.filter((candidate) => !candidate.maintained)) {
    if (!manifest.includes(`.widget.${entry.receiver}`)) {
      throw new Error(`retired provider ${entry.receiver} is missing from AndroidManifest.xml (its instances could never be found again)`)
    }
  }

  // 「判决正确」与「判决真的会被执行」是两件事：没有这个调用点，注册表再正确，拾取器里也还是七条。
  const mainActivity = readFileSync(join(ROOT_DIR, 'android/app/src/main/java/com/classtrack/app/MainActivity.java'), 'utf8')
  if (!mainActivity.includes('WidgetProviderScopeGate.apply(')) {
    throw new Error('MainActivity no longer converges the widget provider scope (WidgetProviderScopeGate.apply is gone)')
  }
}

export function assertAssetMapEqual(label, expected, actual, { allowedExtraPaths = [] } = {}) {
  const allowedExtras = new Set(allowedExtraPaths)
  const missing = [...expected.keys()].filter((assetPath) => !actual.has(assetPath))
  const extra = [...actual.keys()].filter((assetPath) => !expected.has(assetPath) && !allowedExtras.has(assetPath))
  const mismatched = [...expected.keys()].filter(
    (assetPath) => actual.has(assetPath) && !expected.get(assetPath).equals(actual.get(assetPath))
  )

  if (missing.length === 0 && extra.length === 0 && mismatched.length === 0) return

  const details = [`${label} does not match the current web build`]
  if (missing.length > 0) details.push(`missing(${missing.length})=${missing.slice(0, 5).join(',')}`)
  if (extra.length > 0) details.push(`extra(${extra.length})=${extra.slice(0, 5).join(',')}`)
  if (mismatched.length > 0) details.push(`changed(${mismatched.length})=${mismatched.slice(0, 5).join(',')}`)
  throw new Error(details.join(' '))
}

function runUnzip(args, encoding) {
  const result = spawnSync('unzip', args, { encoding, maxBuffer: MAX_UNZIP_OUTPUT_BYTES })
  if (result.error || result.status !== 0) {
    throw new Error('unable to read APK assets; install the unzip command and provide a built APK')
  }
  return result.stdout
}

export function readApkAssetDirectory(apkPath) {
  if (!existsSync(apkPath) || !statSync(apkPath).isFile()) {
    throw new Error('APK does not exist')
  }

  const listing = runUnzip(['-Z1', apkPath], 'utf8')
  const assetEntries = listing.split(/\r?\n/).filter((entry) => entry.startsWith(APK_ASSET_PREFIX) && !entry.endsWith('/'))
  const files = new Map()

  for (const entry of assetEntries) {
    const assetPath = entry.slice(APK_ASSET_PREFIX.length)
    files.set(assetPath, runUnzip(['-p', apkPath, entry], null))
  }

  return files
}

export function checkAndroidAssets({ buildDir = BUILD_DIR, syncedAssetsDir = SYNCED_ASSETS_DIR, apkPath = DEFAULT_APK_PATH } = {}) {
  assertNativeShellContract()
  assertWidgetProviders()
  const buildAssets = readAssetDirectory(buildDir)
  const syncedAssets = readAssetDirectory(syncedAssetsDir)
  assertAssetMapEqual('Capacitor synced assets', buildAssets, syncedAssets, {
    allowedExtraPaths: ['cordova.js', 'cordova_plugins.js'],
  })

  const indexHtml = buildAssets.get('index.html')
  if (!indexHtml) throw new Error('web build does not contain index.html')

  const references = collectLocalAssetReferences(indexHtml.toString('utf8'))
  const missingReferences = references.filter((assetPath) => !syncedAssets.has(assetPath))
  if (missingReferences.length > 0) {
    throw new Error(`shell index references missing synced assets: ${missingReferences.join(',')}`)
  }

  const apkAssets = readApkAssetDirectory(apkPath)
  assertAssetMapEqual('APK assets/public', syncedAssets, apkAssets)

  return {
    assetCount: syncedAssets.size,
    referencedAssetCount: references.length,
    apkPath,
    indexSha256: sha256File(join(buildDir, 'index.html')),
    apkSha256: sha256File(apkPath),
  }
}

const currentModulePath = resolve(fileURLToPath(import.meta.url))
const invokedModulePath = process.argv[1] ? resolve(process.argv[1]) : null

if (invokedModulePath === currentModulePath) {
  const apkPath = process.argv[2] || process.env.CLASS_TRACK_ANDROID_APK_PATH || DEFAULT_APK_PATH

  try {
    const result = checkAndroidAssets({ apkPath })
    console.log(
      `Android asset check passed: ${result.assetCount} assets, ${result.referencedAssetCount} index references, index sha256=${result.indexSha256}, apk sha256=${result.apkSha256}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown asset check failure'
    console.error(`Android asset check failed: ${message}`)
    if (existsSync(apkPath)) {
      const webIndexPath = join(BUILD_DIR, 'index.html')
      const webIndexSha256 = existsSync(webIndexPath) ? sha256File(webIndexPath) : 'unavailable'
      console.error(`Android asset check hashes: web index sha256=${webIndexSha256}, apk sha256=${sha256File(apkPath)}`)
    }
    process.exitCode = 1
  }
}
