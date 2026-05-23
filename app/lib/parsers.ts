
import type { Class, School, ClassParser } from './types';

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
function generateClassId(rawClass: any): string {
  return `${rawClass.JXBID}-${rawClass.SKXQ}-${rawClass.KSJC}`;
}

// 天津理工大学解析器
export const tianjinUniversityOfTechnologyParser: ClassParser = {
  id: 'tianjin-university-of-technology',
  name: '天津理工大学',
  description: '适用于天津理工大学教务系统导出的JSON课程表',
  parse: (data: any): Class[] => {
    // 获取课程数据数组
    const rawClasses: any[] = data?.datas?.cxxszhxqkb?.rows || [];
    
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

// 学校列表
export const schools: School[] = [
  {
    id: 'tianjin-university-of-technology',
    name: '天津理工大学',
    parserId: 'tianjin-university-of-technology',
  },
];

// 解析器列表
export const parsers: ClassParser[] = [
  tianjinUniversityOfTechnologyParser,
];

// 根据ID获取解析器
export function getParserById(id: string): ClassParser | undefined {
  return parsers.find(p => p.id === id);
}

// 根据学校获取默认解析器
export function getParserBySchool(school: School): ClassParser | undefined {
  return getParserById(school.parserId);
}

