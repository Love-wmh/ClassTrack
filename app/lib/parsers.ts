
import type { Class, RawClass, ClassParser } from './types';

// 将二进制字符串解析为周次数组
function parseWeeks(skzc: string): number[] {
  const weeks: number[] = [];
  for (let i = 0; i < skzc.length; i++) {
    if (skzc[i] === '1') {
      weeks.push(i + 1); // 周次从1开始
    }
  }
  return weeks;
}

// 生成唯一课程ID
function generateClassId(rawClass: RawClass): string {
  return `${rawClass.JXBID}-${rawClass.SKXQ}-${rawClass.KSJC}`;
}

// 解析 mockClass.json 的解析器
export const mockClassParser: ClassParser = {
  name: 'MockClassParser',
  parse: (data: any): Class[] => {
    // 获取课程数据数组
    const rawClasses: RawClass[] = data?.datas?.cxxszhxqkb?.rows || [];
    
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
    }));
  },
};
