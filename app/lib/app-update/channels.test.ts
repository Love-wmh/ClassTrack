import { describe, expect, it } from 'vitest'
import {
  defaultChannelFor,
  isAllowedReleaseUrl,
  normalizeChannel,
  resolveUpdate,
  seedChannel,
  selectCandidate,
  toUpdateCandidate,
} from './channels'
import type { UpdateCandidate } from './channels'

function candidate(version: string, prerelease: boolean): UpdateCandidate {
  return {
    version,
    prerelease,
    tag: prerelease ? `android-beta-${version.split('.')[2].replace('-beta', '')}` : `v${version}`,
    title: `ClassTrack Android ${version}`,
    notes: '',
    pageUrl: `https://github.com/Love-wmh/ClassTrack/releases/tag/${version}`,
  }
}

/** 造一条形状与 GitHub API 一致的原始 release。 */
function rawRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'android-beta-10',
    name: 'ClassTrack Android 1.0.10-beta',
    body: 'ClassTrack Android **1.0.10-beta**',
    html_url: 'https://github.com/Love-wmh/ClassTrack/releases/tag/android-beta-10',
    prerelease: true,
    ...overrides,
  }
}

describe('release 原始数据收窄', () => {
  it('从标题取版本号并去掉 v 前缀', () => {
    expect(toUpdateCandidate(rawRelease())?.version).toBe('1.0.10-beta')
    expect(toUpdateCandidate({ ...rawRelease(), tag_name: 'v1.2.0', name: 'ClassTrack Android v1.2.0', prerelease: false })?.version).toBe(
      '1.2.0'
    )
  })

  it('标题取不到版本号时回退到 tag 规则', () => {
    expect(toUpdateCandidate(rawRelease({ name: 'ClassTrack Android' }))?.version).toBe('1.0.10-beta')
    expect(toUpdateCandidate(rawRelease({ name: '别的标题', tag_name: 'v1.2.0', prerelease: false }))?.version).toBe('1.2.0')
    expect(toUpdateCandidate(rawRelease({ name: '', tag_name: 'android-beta-7' }))?.version).toBe('1.0.7-beta')
  })

  it('标题与 tag 都取不到版本号时返回 null', () => {
    expect(toUpdateCandidate(rawRelease({ name: 'ClassTrack Android', tag_name: 'release-2026' }))).toBeNull()
  })

  it('prerelease 不是真 boolean 时返回 null', () => {
    expect(toUpdateCandidate(rawRelease({ prerelease: 'false' }))).toBeNull()
    expect(toUpdateCandidate(rawRelease({ prerelease: undefined }))).toBeNull()
  })

  it('非对象或数组项返回 null', () => {
    expect(toUpdateCandidate(null)).toBeNull()
    expect(toUpdateCandidate('release')).toBeNull()
    expect(toUpdateCandidate([])).toBeNull()
  })

  it('html_url 前缀不符时返回 null（远端数据不能变成任意跳转地址）', () => {
    expect(isAllowedReleaseUrl('https://evil.example.com/Love-wmh/ClassTrack/releases/x')).toBe(false)
    expect(toUpdateCandidate(rawRelease({ html_url: 'https://evil.example.com/x' }))).toBeNull()
    expect(toUpdateCandidate(rawRelease({ html_url: undefined }))).toBeNull()
    // http（非 https）也不放行。
    expect(toUpdateCandidate(rawRelease({ html_url: 'http://github.com/Love-wmh/ClassTrack/releases/tag/x' }))).toBeNull()
  })

  it('缺失的文本字段退化成空串而不是 undefined', () => {
    const parsed = toUpdateCandidate(rawRelease({ body: undefined, name: undefined }))
    expect(parsed?.notes).toBe('')
    expect(parsed?.title).toBe('')
  })
})

describe('通道筛选', () => {
  const stable12 = candidate('1.2.0', false)
  const beta11 = candidate('1.0.11-beta', true)
  const candidates = [beta11, stable12]

  it('stable 忽略预发布', () => {
    expect(selectCandidate(candidates, 'stable')).toBe(stable12)
  })

  it('beta 忽略正式版', () => {
    expect(selectCandidate(candidates, 'beta')).toBe(beta11)
  })

  it('all 跨通道取版本号更新者', () => {
    expect(selectCandidate(candidates, 'all')).toBe(stable12)
    // 测试版更号更大时反过来选测试版。
    expect(selectCandidate([candidate('1.5.2-beta', true), stable12], 'all')?.version).toBe('1.5.2-beta')
  })

  it('某条轨道为空时不报错', () => {
    expect(selectCandidate([stable12], 'beta')).toBeNull()
    expect(selectCandidate([beta11], 'stable')).toBeNull()
    expect(selectCandidate([], 'all')).toBeNull()
  })
})

describe('更新判定', () => {
  const candidates = [candidate('1.2.0', false), candidate('1.0.11-beta', true)]

  it('候选严格比当前版本新才提示', () => {
    expect(resolveUpdate({ candidates, channel: 'all', currentVersion: '1.0.10-beta', skippedVersion: null })?.version).toBe('1.2.0')
    // 与当前版本相同 → 不提示。
    expect(resolveUpdate({ candidates, channel: 'beta', currentVersion: '1.0.11-beta', skippedVersion: null })).toBeNull()
    // 比当前版本旧 → 不提示。
    expect(resolveUpdate({ candidates, channel: 'all', currentVersion: '2.0.0', skippedVersion: null })).toBeNull()
    // 当前版本无法解析 → 不提示（判不出来不算有新版本）。
    expect(resolveUpdate({ candidates, channel: 'all', currentVersion: '1.0', skippedVersion: null })).toBeNull()
  })

  it('被跳过的版本不自动提示，但手动检查仍能看到', () => {
    const skipped = { candidates, channel: 'all' as const, currentVersion: '1.0.10-beta', skippedVersion: '1.2.0' }
    expect(resolveUpdate(skipped)).toBeNull()
    expect(resolveUpdate({ ...skipped, ignoreSkipped: true })?.version).toBe('1.2.0')
  })
})

describe('通道播种只做一次', () => {
  it('测试版包播种为「全部」，正式版包播种为「仅正式版」', () => {
    expect(defaultChannelFor('1.0.10-beta')).toBe('all')
    expect(defaultChannelFor('1.2.0')).toBe('stable')
  })

  it('存储里已有值时，换一种安装包类型也不会被改写', () => {
    // 这条直接钉住用户口径：测试版包升级到正式版之后，通道仍然是「全部」。
    expect(seedChannel('all', '1.2.0')).toBe('all')
    expect(seedChannel('stable', '1.0.10-beta')).toBe('stable')
    expect(seedChannel('beta', '1.2.0')).toBe('beta')
  })

  it('没有值时才按安装包类型播种', () => {
    expect(seedChannel(null, '1.0.10-beta')).toBe('all')
    expect(seedChannel(null, '1.2.0')).toBe('stable')
  })

  it('只认识三个通道，别的值当未播种处理', () => {
    expect(normalizeChannel('all')).toBe('all')
    expect(normalizeChannel('nightly')).toBeNull()
    expect(normalizeChannel(undefined)).toBeNull()
  })
})
