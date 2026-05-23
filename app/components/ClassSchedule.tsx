
import React, { useState, useEffect } from 'react';
import { useClassStore } from '~/store/classStore';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Class } from '~/lib/types';
import SchoolSelectDialog from '~/components/SchoolSelectDialog';
import ImportDialog from '~/components/ImportDialog';

// 星期几名称
const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 节次时间 - 按上午、下午、晚上分组
const sectionGroups = [
  { name: '上午', sections: [1, 2, 3, 4] },
  { name: '下午', sections: [5, 6, 7, 8] },
  { name: '晚上', sections: [9, 10, 11] },
];

const sectionInfo: Record<number, { time: string; group: string }> = {
  1: { time: '08:00-09:40', group: '上午' },
  2: { time: '08:00-09:40', group: '上午' },
  3: { time: '10:10-11:50', group: '上午' },
  4: { time: '10:10-11:50', group: '上午' },
  5: { time: '14:00-15:40', group: '下午' },
  6: { time: '14:00-15:40', group: '下午' },
  7: { time: '16:10-17:50', group: '下午' },
  8: { time: '16:10-17:50', group: '下午' },
  9: { time: '18:30-21:05', group: '晚上' },
  10: { time: '18:30-21:05', group: '晚上' },
  11: { time: '18:30-21:05', group: '晚上' },
};

export default function ClassSchedule() {
  const {
    classes,
    classMarks,
    currentWeek,
    isInitialized,
    school,
    setShowSchoolDialog,
    toggleAttendance,
    setNote,
    setCurrentWeek,
  } = useClassStore();

  const [editingNote, setEditingNote] = useState<{ id: string; week: number } | null>(null);
  const [noteText, setNoteText] = useState('');

  // 初始化检查
  useEffect(() => {
    if (!isInitialized) {
      if (!school) {
        setShowSchoolDialog(true);
      } else if (classes.length === 0) {
        // 有学校但没有课程数据，显示导入对话框
      }
    }
  }, [isInitialized, school, classes.length, setShowSchoolDialog]);

  // 获取当前周的课程
  const getWeekClasses = () => {
    return classes.filter((cls) => cls.weeks.includes(currentWeek));
  };

  // 获取课程标记
  const getClassMark = (classId: string, week: number) => {
    return classMarks[`${classId}-${week}`];
  };

  // 开始编辑备注
  const handleStartEditNote = (classId: string, week: number, currentNote: string) => {
    setEditingNote({ id: classId, week });
    setNoteText(currentNote);
  };

  // 保存备注
  const handleSaveNote = () => {
    if (editingNote) {
      setNote(editingNote.id, editingNote.week, noteText);
      setEditingNote(null);
      setNoteText('');
    }
  };

  // 按星期几和节次组织课程
  const organizeClassesByDay = (weekClasses: Class[]) => {
    const organized: Record<number, Record<number, Class[]>> = {};
    
    for (let day = 1; day <= 7; day++) {
      organized[day] = {};
      for (let section = 1; section <= 11; section++) {
        organized[day][section] = [];
      }
    }

    weekClasses.forEach((cls) => {
      for (let section = cls.startSection; section <= cls.endSection; section++) {
        if (!organized[cls.dayOfWeek][section]) {
          organized[cls.dayOfWeek][section] = [];
        }
        // 只在开始节次添加课程，避免重复
        if (section === cls.startSection) {
          organized[cls.dayOfWeek][section].push(cls);
        }
      }
    });

    return organized;
  };

  const weekClasses = getWeekClasses();
  const organizedClasses = organizeClassesByDay(weekClasses);

  // 计算最大周数
  const maxWeek = classes.reduce((max, cls) => {
    const clsMaxWeek = Math.max(...cls.weeks);
    return Math.max(max, clsMaxWeek);
  }, 20);

  if (!isInitialized) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <h2 className='text-2xl font-semibold mb-4'>欢迎使用课程表</h2>
          <p className='text-muted-foreground mb-8'>请先选择学校并导入课程表</p>
        </div>
        <SchoolSelectDialog />
        <ImportDialog />
      </div>
    );
  }

  return (
    <div className='container mx-auto py-8 px-4'>
      <SchoolSelectDialog />
      <ImportDialog />
      
      {/* 顶部标题和周次控制 */}
      <div className='flex flex-col md:flex-row justify-between items-center mb-8 gap-4'>
        <div>
          <h1 className='text-3xl font-bold'>课程表</h1>
          {school && (
            <p className='text-muted-foreground'>{school.name}</p>
          )}
        </div>
        <div className='flex items-center gap-4'>
          <Button
            variant='outline'
            size='icon'
            onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
            disabled={currentWeek <= 1}
          >
            <ChevronLeft className='size-4' />
          </Button>
          <span className='text-xl font-medium'>第 {currentWeek} 周</span>
          <Button
            variant='outline'
            size='icon'
            onClick={() => setCurrentWeek(Math.min(maxWeek, currentWeek + 1))}
            disabled={currentWeek >= maxWeek}
          >
            <ChevronRight className='size-4' />
          </Button>
        </div>
      </div>

      {/* 课程表网格 */}
      <div className='overflow-x-auto'>
        <div className='min-w-[800px]'>
          {/* 表头：星期几 */}
          <div className='grid grid-cols-8 gap-1 mb-1'>
            <div className='p-2 font-medium text-center text-muted-foreground'>节次</div>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <div key={day} className='p-2 font-medium text-center bg-muted rounded-t-lg'>
                {dayNames[day]}
              </div>
            ))}
          </div>

          {/* 节次和课程 - 按上午、下午、晚上分组 */}
          <div className='space-y-4'>
            {sectionGroups.map((group) => (
              <div key={group.name} className='space-y-1'>
                {/* 分组标题 */}
                <div className='font-medium text-sm text-muted-foreground pl-2 border-l-2 border-primary'>
                  {group.name}
                </div>
                
                {/* 该分组的节次 */}
                {group.sections.map((section) => (
                  <div key={section} className='grid grid-cols-8 gap-1'>
                    {/* 节次标签 */}
                    <div className='p-2 text-center text-sm text-muted-foreground bg-muted/50 flex flex-col justify-center'>
                      <div>第 {section} 节</div>
                      <div className='text-xs'>{sectionInfo[section].time}</div>
                    </div>

                    {/* 每天的课程 */}
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                      const dayClasses = organizedClasses[day][section] || [];
                      
                      return (
                        <div key={day} className='min-h-[90px] bg-card border rounded-lg p-1'>
                          {dayClasses.map((cls) => {
                            const mark = getClassMark(cls.id, currentWeek);
                            const isAttended = mark?.isAttended || false;
                            const note = mark?.note || '';
                            
                            return (
                              <Card
                                key={cls.id}
                                className={`mb-1 transition-all ${
                                  isAttended ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : 'border-red-500/30 bg-red-50 dark:bg-red-950/20'
                                }`}
                              >
                                <CardHeader className='p-2 pb-0'>
                                  <div className='flex justify-between items-start'>
                                    <CardTitle className='text-sm font-medium truncate flex-1'>
                                      {cls.name}
                                    </CardTitle>
                                    <Button
                                      variant='ghost'
                                      size='icon-xs'
                                      onClick={() => toggleAttendance(cls.id, currentWeek)}
                                      className={isAttended ? 'text-green-600' : 'text-red-600'}
                                    >
                                      {isAttended ? <Check className='size-3' /> : <X className='size-3' />}
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CardContent className='p-2 pt-1'>
                                  <div className='text-xs text-muted-foreground mb-1'>
                                    {cls.teacher} · {cls.classroom}
                                  </div>
                                  <Badge variant='secondary' className='text-xs'>
                                    {cls.courseType}
                                  </Badge>
                                  
                                  {/* 备注区域 */}
                                  {editingNote?.id === cls.id && editingNote?.week === currentWeek ? (
                                    <div className='mt-2 space-y-1'>
                                      <Input
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        placeholder='添加备注...'
                                        className='text-xs h-7'
                                        autoFocus
                                        onBlur={handleSaveNote}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveNote()}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className='mt-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded'
                                      onClick={() => handleStartEditNote(cls.id, currentWeek, note)}
                                    >
                                      {note ? (
                                        <span className='text-blue-600 dark:text-blue-400'>{note}</span>
                                      ) : (
                                        <span className='text-muted-foreground italic'>点击添加备注...</span>
                                      )}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

