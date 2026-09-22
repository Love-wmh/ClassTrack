import { describe, expect, it } from 'vitest'
import type { ImportMethod } from '~/store/slices/uiSlice'
import {
  IMPORT_METHOD_NOTICE,
  normalizeImportMethod,
  resolveImportMethodPolicy,
  type ImportMethodNoticeCode,
  type ImportMethodPolicy,
} from './import-methods'

/** 规范序：任何平台的列表都必须是它的子序列（面板顺序不随平台漂移）。 */
const CANONICAL_ORDER: readonly ImportMethod[] = ['backup', 'parser', 'native-webview']

/** 六种组合的全矩阵：平台 × 插件 × 适配器。 */
const MATRIX = [
  {
    android: false,
    nativeImportAvailable: false,
    hasNativeAdapter: false,
    methods: ['backup', 'parser'],
    defaultMethod: 'parser',
    noticeCode: null,
  },
  {
    android: false,
    nativeImportAvailable: false,
    hasNativeAdapter: true,
    methods: ['backup', 'parser'],
    defaultMethod: 'parser',
    noticeCode: null,
  },
  {
    android: false,
    nativeImportAvailable: true,
    hasNativeAdapter: false,
    methods: ['backup', 'parser'],
    defaultMethod: 'parser',
    noticeCode: null,
  },
  {
    android: false,
    nativeImportAvailable: true,
    hasNativeAdapter: true,
    methods: ['backup', 'parser', 'native-webview'],
    defaultMethod: 'parser',
    noticeCode: null,
  },
  {
    android: true,
    nativeImportAvailable: true,
    hasNativeAdapter: true,
    methods: ['backup', 'native-webview'],
    defaultMethod: 'native-webview',
    noticeCode: null,
  },
  {
    android: true,
    nativeImportAvailable: true,
    hasNativeAdapter: false,
    methods: ['backup'],
    defaultMethod: 'backup',
    noticeCode: 'ANDROID_UNSUPPORTED_SCHOOL',
  },
  // 适配器在但插件没注册：环境问题不是学校问题，所以不给「暂不支持这所学校」的提示。
  { android: true, nativeImportAvailable: false, hasNativeAdapter: true, methods: ['backup'], defaultMethod: 'backup', noticeCode: null },
  {
    android: true,
    nativeImportAvailable: false,
    hasNativeAdapter: false,
    methods: ['backup'],
    defaultMethod: 'backup',
    noticeCode: 'ANDROID_UNSUPPORTED_SCHOOL',
  },
] as const satisfies ReadonlyArray<{
  android: boolean
  nativeImportAvailable: boolean
  hasNativeAdapter: boolean
  methods: ImportMethod[]
  defaultMethod: ImportMethod
  noticeCode: ImportMethodNoticeCode | null
}>

describe('导入方式策略', () => {
  it.each(MATRIX)(
    'android=$android plugin=$nativeImportAvailable adapter=$hasNativeAdapter → $methods（默认 $defaultMethod）',
    ({ android, nativeImportAvailable, hasNativeAdapter, methods, defaultMethod, noticeCode }) => {
      const policy = resolveImportMethodPolicy({ android, nativeImportAvailable, hasNativeAdapter })

      expect(policy.methods).toEqual(methods)
      expect(policy.defaultMethod).toBe(defaultMethod)
      expect(policy.noticeCode).toBe(noticeCode)
    }
  )

  it('每一行都满足不变量：至少一种方式、默认方式在列表里、顺序是规范序的子序列', () => {
    for (const row of MATRIX) {
      const policy = resolveImportMethodPolicy(row)

      expect(policy.methods.length).toBeGreaterThanOrEqual(1)
      expect(policy.methods).toContain(policy.defaultMethod)
      expect(policy.methods).toEqual(CANONICAL_ORDER.filter((method) => policy.methods.includes(method)))
    }
  })

  it('非安卓的行为与收窄前完全一致（回归护栏）：三张卡只在有插件且有适配器时出现', () => {
    const withoutNative = resolveImportMethodPolicy({ android: false, nativeImportAvailable: true, hasNativeAdapter: false })
    const withNative = resolveImportMethodPolicy({ android: false, nativeImportAvailable: true, hasNativeAdapter: true })

    expect(withoutNative.methods).toEqual(['backup', 'parser'])
    expect(withNative.methods).toEqual(['backup', 'parser', 'native-webview'])
    for (const policy of [withoutNative, withNative]) {
      expect(policy.defaultMethod).toBe('parser')
      expect(policy.noticeCode).toBeNull()
    }
  })

  it('安卓端永远不提供解析器那条路（书签脚本 / JSON 上传）', () => {
    for (const row of MATRIX.filter((candidate) => candidate.android)) {
      expect(resolveImportMethodPolicy(row).methods).not.toContain('parser')
    }
  })

  it('安卓端永远保留备份导入（换设备恢复数据的唯一口子）', () => {
    for (const row of MATRIX.filter((candidate) => candidate.android)) {
      expect(resolveImportMethodPolicy(row).methods).toContain('backup')
    }
  })

  it('每个提示码都有非空文案，且指向一个安卓上真实存在的方式', () => {
    const codes: ImportMethodNoticeCode[] = ['ANDROID_UNSUPPORTED_SCHOOL']

    // 表里不许有多余的键：加了码却忘了列进 codes 时这条会红。
    expect(Object.keys(IMPORT_METHOD_NOTICE).sort()).toEqual([...codes].sort())
    for (const code of codes) {
      expect(IMPORT_METHOD_NOTICE[code].trim().length, code).toBeGreaterThan(8)
    }
    expect(IMPORT_METHOD_NOTICE.ANDROID_UNSUPPORTED_SCHOOL).toContain('导入已有数据')
  })
})

describe('当前方式的收敛', () => {
  const androidWithAdapter: ImportMethodPolicy = resolveImportMethodPolicy({
    android: true,
    nativeImportAvailable: true,
    hasNativeAdapter: true,
  })
  const androidWithoutAdapter: ImportMethodPolicy = resolveImportMethodPolicy({
    android: true,
    nativeImportAvailable: true,
    hasNativeAdapter: false,
  })
  const web: ImportMethodPolicy = resolveImportMethodPolicy({
    android: false,
    nativeImportAvailable: false,
    hasNativeAdapter: false,
  })

  it('合法就保留（不无谓重置用户的选择）', () => {
    expect(normalizeImportMethod(androidWithAdapter, 'native-webview')).toBe('native-webview')
    expect(normalizeImportMethod(androidWithAdapter, 'backup')).toBe('backup')
    expect(normalizeImportMethod(web, 'parser')).toBe('parser')
  })

  it('安卓上天理切到天工：应用内导入没了，收敛到备份导入（不是解析器）', () => {
    expect(normalizeImportMethod(androidWithoutAdapter, 'native-webview')).toBe('backup')
  })

  it('安卓上停在解析器时也收敛（收窄后它已不在列表里）', () => {
    expect(normalizeImportMethod(androidWithAdapter, 'parser')).toBe('native-webview')
    expect(normalizeImportMethod(androidWithoutAdapter, 'parser')).toBe('backup')
  })

  it('非安卓不会把解析器收掉（书签脚本路径不变）', () => {
    expect(normalizeImportMethod(web, 'parser')).toBe('parser')
  })
})
