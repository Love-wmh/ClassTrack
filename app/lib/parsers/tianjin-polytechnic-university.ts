import type { Class, ClassParser } from '../types'

function parseWeeks(skzc: string): number[] {
  const weeks: number[] = []
  for (let i = 0; i < skzc.length; i++) {
    if (skzc[i] === '1') {
      weeks.push(i + 1)
    }
  }
  return weeks
}

function generateClassId(rawClass: any): string {
  return `${rawClass.JXBID}-${rawClass.SKXQ}-${rawClass.KSJC}`
}

export const tianjinPolytechnicUniversityParser: ClassParser = {
  id: 'tianjin-polytechnic-university',
  name: '天津工业大学',
  description: '适用于天津工业大学教务系统导出的JSON课程表',
  parse: (data: any): Class[] => {
    const rawClasses = data?.datas?.cxxszhxqkb?.rows

    if (!Array.isArray(rawClasses) || rawClasses.length === 0) {
      throw new Error('未解析到课程数据')
    }

    return rawClasses.map((rawClass) => ({
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
  },
}
