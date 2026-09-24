import { readFileSync } from 'node:fs'
// 用 fileURLToPath 而不是 URL.pathname：仓库路径含中文，pathname 会带百分号编码。
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GuideStorage } from './guide-storage'
import {
  hasSeenProfileGuide,
  markProfileGuideSeen,
  PROFILE_GUIDE_DESCRIPTION,
  PROFILE_GUIDE_PRIMARY_ACTION,
  PROFILE_GUIDE_SECONDARY_ACTION,
  PROFILE_GUIDE_STORAGE_KEY,
  PROFILE_GUIDE_TITLE,
  shouldShowProfileGuide,
} from './profile-guide'

/** 假存储：既方便断言键值，也能造出「读得到 / 读不到」两种现场。 */
function createFakeStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial))

  return {
    entries,
    storage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value)
      },
    } satisfies GuideStorage,
  }
}

/** 隐私模式现场：读写都抛。 */
const throwingStorage: GuideStorage = {
  getItem: () => {
    throw new Error('storage is disabled')
  },
  setItem: () => {
    throw new Error('storage is disabled')
  },
}

describe('第二段引导的已读标记', () => {
  it('没标记就是没读过，记过之后才为真', () => {
    const { storage } = createFakeStorage()

    expect(hasSeenProfileGuide(storage)).toBe(false)
    markProfileGuideSeen(storage)
    expect(hasSeenProfileGuide(storage)).toBe(true)
  })

  it('只写自己的那个键（不污染加桌引导与业务数据）', () => {
    const { entries, storage } = createFakeStorage({
      'class-track-storage': '{"school":null}',
      'class-track-widget-guide-seen': '1',
    })

    markProfileGuideSeen(storage)

    expect([...entries.keys()].sort()).toEqual(['class-track-storage', 'class-track-widget-guide-seen', PROFILE_GUIDE_STORAGE_KEY].sort())
    expect(entries.get(PROFILE_GUIDE_STORAGE_KEY)).toBe('1')
  })

  it('标记值不是约定值时算没读过（脏数据不吞掉引导）', () => {
    const { storage } = createFakeStorage({ [PROFILE_GUIDE_STORAGE_KEY]: 'yes' })

    expect(hasSeenProfileGuide(storage)).toBe(false)
  })

  it('没有存储（null）时：读为假、写不抛', () => {
    expect(hasSeenProfileGuide(null)).toBe(false)
    expect(() => markProfileGuideSeen(null)).not.toThrow()
  })

  it('存储抛异常时：读为假、写不抛（隐私模式不该打断导入后的流程）', () => {
    expect(hasSeenProfileGuide(throwingStorage)).toBe(false)
    expect(() => markProfileGuideSeen(throwingStorage)).not.toThrow()
  })
})

describe('第二段引导的触发判定', () => {
  it('只有「有小工具 + 没读过」才该弹', () => {
    expect(shouldShowProfileGuide({ nativeWidgetAvailable: true, seen: false })).toBe(true)
    expect(shouldShowProfileGuide({ nativeWidgetAvailable: true, seen: true })).toBe(false)
    expect(shouldShowProfileGuide({ nativeWidgetAvailable: false, seen: false })).toBe(false)
    expect(shouldShowProfileGuide({ nativeWidgetAvailable: false, seen: true })).toBe(false)
  })
})

describe('第二段引导的文案', () => {
  it('标题、说明与两个按钮文案都非空', () => {
    for (const copy of [PROFILE_GUIDE_TITLE, PROFILE_GUIDE_DESCRIPTION, PROFILE_GUIDE_PRIMARY_ACTION, PROFILE_GUIDE_SECONDARY_ACTION]) {
      expect(copy.length).toBeGreaterThan(1)
    }
  })

  it('按钮就是「前往 / 暂时不用」（用户 2026-09-23 口径）', () => {
    expect(PROFILE_GUIDE_PRIMARY_ACTION).toBe('前往')
    expect(PROFILE_GUIDE_SECONDARY_ACTION).toBe('暂时不用')
  })

  it('说明里点到个人中心真实存在的设置，不写空话', () => {
    expect(PROFILE_GUIDE_DESCRIPTION).toContain('个人中心')
    for (const section of ['学期', '样式', '更新', '备份']) {
      expect(PROFILE_GUIDE_DESCRIPTION).toContain(section)
    }
  })
})

/**
 * 接线与显示时机的**结构守卫**。
 *
 * 「第一段引导关闭时触发第二段」「第二段等加桌面板关掉才出现」这两件事漏掉照样能编译通过，
 * 而设备实测在本机不可用，所以用读真实源码的断言把它们钉住 —— 与 `widget-guide.test.ts` 同源。
 */
describe('第二段引导的接线（源文件级守卫）', () => {
  const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

  it('第一段引导关闭时判断并安排第二段（标记也在那一刻写）', () => {
    const source = readFileSync(join(REPO_ROOT, 'app/components/native-widget/WidgetGuideDialog.tsx'), 'utf8')

    expect(source).toContain("from '~/lib/profile-guide'")
    expect(source).toContain('shouldShowProfileGuide(')
    expect(source).toContain('hasSeenProfileGuide()')
    expect(source).toContain('markProfileGuideSeen()')
    expect(source).toContain('setShowProfileGuide(true)')
  })

  it('第二段挂在全局 Layout 上，与加桌引导并列', () => {
    const source = readFileSync(join(REPO_ROOT, 'app/root.tsx'), 'utf8')

    expect(source).toContain('<ProfileGuideDialog />')
    expect(source).toMatch(/!nativeShell && <ProfileGuideDialog \/>/)
    expect(source).toContain('<WidgetGuideDialog />')
  })

  it('「去添加」路径下第二段等加桌面板关掉再出现（显示条件含 !widgetPinSheetOpen）', () => {
    const source = readFileSync(join(REPO_ROOT, 'app/components/native-widget/ProfileGuideDialog.tsx'), 'utf8')

    expect(source).toContain('showProfileGuide && !widgetPinSheetOpen')
    expect(source).toContain('data-guide="profile"')
  })
})
