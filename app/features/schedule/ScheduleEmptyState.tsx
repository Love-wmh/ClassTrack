import SchoolSelectDialog from '~/components/dialog/SchoolSelectDialog'
import ImportDialog from '~/components/dialog/ImportDialog'
import type { School } from '~/lib/types'

type ScheduleEmptyStateProps = {
  school: School | null
  hasClasses: boolean
}

export default function ScheduleEmptyState({ school, hasClasses }: ScheduleEmptyStateProps) {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">欢迎使用课程表</h2>
        <p className="text-muted-foreground mb-8">{!school ? '请先选择学校' : !hasClasses ? '请导入课程表' : '正在加载...'}</p>
      </div>
      <SchoolSelectDialog />
      <ImportDialog />
    </div>
  )
}
