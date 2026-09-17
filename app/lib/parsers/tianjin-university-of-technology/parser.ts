import type { Class } from '../../types'
import type { RawClass, RawClassPayload } from './types'

export function parseWeeks(skzc: string): number[] {
  const weeks: number[] = []
  for (let i = 0; i < skzc.length; i++) {
    if (skzc[i] === '1') {
      weeks.push(i + 1)
    }
  }
  return weeks
}

export function generateClassId(rawClass: RawClass): string {
  return `${rawClass.JXBID}-${rawClass.SKXQ}-${rawClass.KSJC}`
}

function readRawClasses(data: unknown): RawClass[] {
  const payload = data as RawClassPayload | null | undefined
  const rows = payload?.datas?.cxxszhxqkb?.rows
  return Array.isArray(rows) ? rows : []
}

export function parse(data: unknown): Class[] {
  const rawClasses = readRawClasses(data)

  if (rawClasses.length === 0) {
    throw new Error('未解析到课程数据')
  }

  return rawClasses.map((rawClass: RawClass) => ({
    id: generateClassId(rawClass),
    name: rawClass.KCM,
    teacher: rawClass.SKJS,
    classroom: rawClass.JASMC,
    startTime: rawClass.KSSJ,
    endTime: rawClass.JSSJ,
    dayOfWeek: rawClass.SKXQ,
    startSection: rawClass.KSJC,
    endSection: rawClass.JSJC,
    weeks: parseWeeks(rawClass.SKZC),
    semester: rawClass.XNXQDM,
    courseId: rawClass.KCH,
    classId: rawClass.JXBID,
    courseType: rawClass.KCXZDM_DISPLAY,
    courseCategory: rawClass.KCLBDM_DISPLAY,
  }))
}
