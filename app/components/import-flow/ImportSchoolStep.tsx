import type { ReactNode } from 'react'
import { Database, FileJson2, Smartphone } from 'lucide-react'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { schools } from '~/lib/parsers'
import type { School } from '~/lib/types'
import type { ImportMethod } from '~/store/slices/uiSlice'
import { OptionCard } from '~/components/common/OptionCard'
import { getNativeCourseImportAdapter } from '~/lib/native-course-import'

const importMethods: Array<{
  value: ImportMethod
  title: string
  description: string
  icon: ReactNode
}> = [
  {
    value: 'backup',
    title: '导入已有数据',
    description: '用于换设备时恢复从数据管理页面导出的结构化数据。',
    icon: <Database className="size-4" />,
  },
  {
    value: 'parser',
    title: '从课程表解析',
    description: '导入学校课程表 JSON，并通过解析器生成课程数据。',
    icon: <FileJson2 className="size-4" />,
  },
  {
    value: 'native-webview',
    title: '应用内打开教务系统',
    description: '在 Android App 内登录并直接捕获当前课表，无需安装书签脚本。',
    icon: <Smartphone className="size-4" />,
  },
]

type ImportSchoolStepProps = {
  selectedSchool: School | null
  selectedImportMethod: ImportMethod
  onSchoolChange: (school: School | null) => void
  onImportMethodChange: (method: ImportMethod) => void
  nativeImportAvailable: boolean
}

export function ImportSchoolStep({
  selectedSchool,
  selectedImportMethod,
  onSchoolChange,
  onImportMethodChange,
  nativeImportAvailable,
}: ImportSchoolStepProps) {
  const availableImportMethods = importMethods.filter(
    (method) => method.value !== 'native-webview' || (nativeImportAvailable && Boolean(getNativeCourseImportAdapter(selectedSchool?.id)))
  )

  const handleSchoolChange = (schoolId: string) => {
    onSchoolChange(schools.find((school) => school.id === schoolId) || null)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="school">学校</Label>
        <Select value={selectedSchool?.id} onValueChange={handleSchoolChange}>
          <SelectTrigger id="school" className="w-full">
            <SelectValue placeholder="请选择学校" />
          </SelectTrigger>
          <SelectContent>
            {schools.map((school) => (
              <SelectItem key={school.id} value={school.id}>
                {school.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>导入方式</Label>
        <div className="grid gap-2">
          {availableImportMethods.map((method) => (
            <OptionCard
              key={method.value}
              title={method.title}
              description={method.description}
              icon={method.icon}
              selected={selectedImportMethod === method.value}
              onClick={() => onImportMethodChange(method.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
