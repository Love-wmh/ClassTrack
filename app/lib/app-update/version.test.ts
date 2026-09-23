import { describe, expect, it } from 'vitest'
import {
  compareAppVersions,
  compareVersionStrings,
  isNewerVersion,
  isPrereleaseBuild,
  normalizeAppVersion,
  parseAppVersion,
} from './version'

describe('版本号解析', () => {
  it('解析正式版与测试版的版本名', () => {
    expect(parseAppVersion('1.2.0')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: null })
    expect(parseAppVersion('1.0.10-beta')).toEqual({ major: 1, minor: 0, patch: 10, prerelease: 'beta' })
    expect(parseAppVersion('1.0.0-local')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'local' })
  })

  it('接受带 v 前缀的 tag 形态', () => {
    expect(parseAppVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null })
  })

  it('不认两位版本号或多余段数，返回 null 而不是抛错', () => {
    expect(parseAppVersion('1.0')).toBeNull()
    expect(parseAppVersion('1.0.10.1')).toBeNull()
    expect(parseAppVersion('')).toBeNull()
    expect(parseAppVersion('completely-unknown')).toBeNull()
  })

  it('归一化时去掉 v 前缀，保留 prerelease 标识', () => {
    expect(normalizeAppVersion('v1.2.0')).toBe('1.2.0')
    expect(normalizeAppVersion('1.0.10-beta')).toBe('1.0.10-beta')
    expect(normalizeAppVersion('nope')).toBeNull()
  })
})

describe('版本号比较', () => {
  it('三元组按数值比较：1.0.10 比 1.0.9 新', () => {
    expect(isNewerVersion('1.0.10-beta', '1.0.9-beta')).toBe(true)
    expect(isNewerVersion('1.0.9-beta', '1.0.10-beta')).toBe(false)
  })

  it('跨通道比较：1.2.0 比 1.0.10-beta 新', () => {
    expect(isNewerVersion('1.2.0', '1.0.10-beta')).toBe(true)
    expect(isNewerVersion('1.0.10-beta', '1.2.0')).toBe(false)
  })

  it('三元组相同时，正式版比测试版新', () => {
    expect(isNewerVersion('1.0.10', '1.0.10-beta')).toBe(true)
    expect(isNewerVersion('1.0.10-beta', '1.0.10')).toBe(false)
  })

  it('同一个版本不算更新', () => {
    expect(isNewerVersion('1.0.10-beta', '1.0.10-beta')).toBe(false)
    expect(compareVersionStrings('1.0.10-beta', '1.0.10-beta')).toBe(0)
  })

  it('解析失败的一侧不算更新（判不出来不能当成有新版本）', () => {
    expect(isNewerVersion('1.0.10-beta', '1.0')).toBe(false)
    expect(isNewerVersion('unknown', '1.0.0')).toBe(false)
  })

  it('无法解析的版本串在排序里被当成最旧，而不是抛错', () => {
    expect(compareVersionStrings('unknown', '1.0.0')).toBeLessThan(0)
    expect(compareVersionStrings('1.0.0', 'unknown')).toBeGreaterThan(0)
    expect(compareVersionStrings('unknown', 'also-unknown')).toBe(0)
  })

  it('compareAppVersions 对相等版本返回 0', () => {
    expect(compareAppVersions(parseAppVersion('1.0.0')!, parseAppVersion('1.0.0')!)).toBe(0)
  })
})

describe('安装包类型判定', () => {
  it('带 - 后缀的版本名视为测试版包', () => {
    expect(isPrereleaseBuild('1.0.10-beta')).toBe(true)
    expect(isPrereleaseBuild('1.0.0-local')).toBe(true)
  })

  it('纯 X.Y.Z 视为正式版包', () => {
    expect(isPrereleaseBuild('1.2.0')).toBe(false)
    // 本地 debug 包的版本名：不是合法版本号，按正式版包处理。
    expect(isPrereleaseBuild('1.0')).toBe(false)
    expect(isPrereleaseBuild('')).toBe(false)
  })
})
