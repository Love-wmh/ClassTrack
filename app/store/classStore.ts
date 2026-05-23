
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Class, ClassMark } from '~/lib/types';

interface ClassStore {
  // 状态
  classes: Class[];
  classMarks: Record<string, ClassMark>; // key: `${classId}-${week}`
  currentWeek: number;
  isInitialized: boolean;

  // 动作
  setClasses: (classes: Class[]) => void;
  toggleAttendance: (classId: string, week: number) => void;
  setNote: (classId: string, week: number, note: string) => void;
  setCurrentWeek: (week: number) => void;
  initialize: () => void;
}

// 获取 classMark 的 key
const getMarkKey = (classId: string, week: number) => `${classId}-${week}`;

export const useClassStore = create<ClassStore>()(
  persist(
    immer((set, get) => ({
      classes: [],
      classMarks: {},
      currentWeek: 1,
      isInitialized: false,

      setClasses: (classes) => {
        set({ classes });
      },

      toggleAttendance: (classId, week) => {
        const key = getMarkKey(classId, week);
        set((state) => {
          if (!state.classMarks[key]) {
            state.classMarks[key] = {
              classId,
              week,
              isAttended: true,
              note: '',
            };
          } else {
            state.classMarks[key].isAttended = !state.classMarks[key].isAttended;
          }
        });
      },

      setNote: (classId, week, note) => {
        const key = getMarkKey(classId, week);
        set((state) => {
          if (!state.classMarks[key]) {
            state.classMarks[key] = {
              classId,
              week,
              isAttended: false,
              note,
            };
          } else {
            state.classMarks[key].note = note;
          }
        });
      },

      setCurrentWeek: (week) => {
        set({ currentWeek: week });
      },

      initialize: () => {
        set({ isInitialized: true });
      },
    })),
    {
      name: 'class-track-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
