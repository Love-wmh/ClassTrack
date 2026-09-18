import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import FirstWeekStartDatePicker from '~/components/common/FirstWeekStartDatePicker'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { ImportStepDescription } from './ImportStepDescription'

type InAppImportStepProps = {
  term: string
  onTermChange: (term: string) => void
  firstWeekStartDate: string | null
  onFirstWeekStartDateChange: (date: string | null) => void
  status: 'idle' | 'opening' | 'captured' | 'failed'
  error: string | null
}

const importDescriptionSteps = [
  '确认学年学期代码正确，然后点击“打开教务系统并导入”。',
  '在应用内页面完成登录、验证码和菜单导航，进入金智课表详情页。',
  '如果没有自动捕获，请刷新课表详情页后重试；ClassTrack 不会读取账号、密码或 Cookie。',
]

export function InAppImportStep({
  term,
  onTermChange,
  firstWeekStartDate,
  onFirstWeekStartDateChange,
  status,
  error,
}: InAppImportStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="native-term">学年学期代码</Label>
        <Input id="native-term" value={term} placeholder="例如 2025-2026-2" onChange={(event) => onTermChange(event.target.value)} />
        <p className="text-sm text-muted-foreground">该代码只用于课表页面未主动请求时的同源补抓请求。</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="native-first-week-start-date">第一周第一天</Label>
        <FirstWeekStartDatePicker
          value={firstWeekStartDate}
          onChange={onFirstWeekStartDateChange}
          placeholder="请选择第一周第一天"
          showIcon={false}
        />
        <p className="text-sm text-muted-foreground">用于按导入时刻自动标记已上课程，请选择本学期第一周的周一。</p>
      </div>

      <ImportStepDescription steps={importDescriptionSteps} />

      <div className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>登录始终发生在天津理工大学教务系统页面内，原始响应只在本次导入期间传递，不会写入备份或浏览器存储。</span>
      </div>

      {status === 'opening' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在打开教务页面，完成操作后将自动返回。
        </p>
      )}
      {status === 'captured' && (
        <p className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="size-4" />
          已捕获课表响应，正在导入课程。
        </p>
      )}
      {status === 'failed' && error && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
