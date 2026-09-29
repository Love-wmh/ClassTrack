import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertViewportHeightAnchor,
  checkWebviewCssFallback,
  findViewportHeightAnchor,
  scanRuleBodies,
} from './check-webview-css-fallback.js'

/** 期望的真产物形态（压缩后，带上构建产物里的 `@layer` 前缀噪声）。 */
const PASSING_CSS =
  '@layer theme,base,components,utilities;' +
  'html,body{background-color:#fff;height:100%;overflow:hidden}' +
  '@supports (height:100dvh){html,body{height:100dvh}}'

test('接受「块外 height:100% 兜底 + @supports 升级」的真产物形态', () => {
  assert.deepEqual(findViewportHeightAnchor(PASSING_CSS), {
    hasFallback: true,
    hasDvhUpgrade: true,
    hasDvh: true,
    fallbackBeforeUpgrade: true,
  })
  assert.doesNotThrow(() => assertViewportHeightAnchor(PASSING_CSS, 'fixture'))
})

test('拦住本次线上缺陷：兜底被构建器删掉、只剩 dvh', () => {
  const regressed = 'html,body{background-color:#fff;height:100dvh;overflow:hidden}'
  assert.equal(findViewportHeightAnchor(regressed).hasFallback, false)
  assert.throws(() => assertViewportHeightAnchor(regressed, 'fixture'), /height:100% 兜底/)
})

test('拦住往同一条规则里双写 height 的写法（产物里没有 @supports 块）', () => {
  const doubleWrite = 'html,body{height:100%;height:100dvh;overflow:hidden}'
  assert.equal(findViewportHeightAnchor(doubleWrite).hasFallback, true)
  assert.equal(findViewportHeightAnchor(doubleWrite).hasDvhUpgrade, false)
  assert.throws(() => assertViewportHeightAnchor(doubleWrite, 'fixture'), /升级块/)
})

test('拦住把兜底也写进 @supports 的写法（那只对支持 dvh 的引擎生效）', () => {
  const insideOnly = '@supports (height:100dvh){html,body{height:100%;height:100dvh}}'
  assert.equal(findViewportHeightAnchor(insideOnly).hasFallback, false)
  assert.throws(() => assertViewportHeightAnchor(insideOnly, 'fixture'), /height:100% 兜底/)
})

test('拦住顺序颠倒：兜底写在升级块之后会让 dvh 被兜底覆盖', () => {
  const reversed = '@supports (height:100dvh){html,body{height:100dvh}}html,body{height:100%}'
  assert.equal(findViewportHeightAnchor(reversed).hasDvhUpgrade, true)
  assert.equal(findViewportHeightAnchor(reversed).fallbackBeforeUpgrade, false)
  assert.throws(() => assertViewportHeightAnchor(reversed, 'fixture'), /升级块之后/)
})

test('不把 min-height / max-height 当成兜底', () => {
  const minOnly = 'html,body{min-height:100%;overflow:hidden}@supports (height:100dvh){html,body{height:100dvh}}'
  assert.equal(findViewportHeightAnchor(minOnly).hasFallback, false)
})

test('压缩与未压缩（prettier 换行）写法都能识别', () => {
  const pretty = [
    'html,',
    'body {',
    '  background-color: #fff;',
    '  height: 100%;',
    '  overflow: hidden;',
    '}',
    '',
    '@supports (height: 100dvh) {',
    '  html,',
    '  body {',
    '    height: 100dvh;',
    '  }',
    '}',
    '',
  ].join('\n')

  assert.deepEqual(findViewportHeightAnchor(pretty), {
    hasFallback: true,
    hasDvhUpgrade: true,
    hasDvh: true,
    fallbackBeforeUpgrade: true,
  })
})

test('scanRuleBodies 只认 html, body，压缩与换行两种写法都命中', () => {
  assert.equal(scanRuleBodies('html,body{height:100%}').length, 1)
  assert.equal(scanRuleBodies('html,\nbody {\n  height: 100%;\n}').length, 1)
  assert.equal(scanRuleBodies('.foo{height:100%}').length, 0)
})

test('产物目录缺失时明确要求先跑 pnpm build', () => {
  assert.throws(() => checkWebviewCssFallback({ assetsDir: join(tmpdir(), '__classtrack_missing_assets__') }), /pnpm build/)
})

test('产物目录里没有 CSS 时同样要求先跑 pnpm build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'classtrack-css-'))
  try {
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    assert.throws(() => checkWebviewCssFallback({ assetsDir: dir }), /pnpm build/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('产物 CSS 缺锚点时按文件名报错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'classtrack-css-'))
  try {
    writeFileSync(join(dir, 'root-abc123.css'), 'html,body{height:100dvh;overflow:hidden}')
    assert.throws(() => checkWebviewCssFallback({ assetsDir: dir }), /root-abc123\.css/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('产物 CSS 完整时给出锚点文件名', () => {
  const dir = mkdtempSync(join(tmpdir(), 'classtrack-css-'))
  try {
    writeFileSync(join(dir, 'root-abc123.css'), PASSING_CSS)
    const result = checkWebviewCssFallback({ assetsDir: dir })
    assert.equal(result.anchorFile, 'root-abc123.css')
    assert.equal(result.styles.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
