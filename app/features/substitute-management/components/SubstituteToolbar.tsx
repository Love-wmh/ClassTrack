import { CalendarDays } from 'lucide-react'
import { zhCN } from 'date-fns/locale'
import { Button } from '~/components/ui/button'
import { Calendar } from '~/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import type { SubstituteExportFormat } from '../export'

const exportOptions: { value: SubstituteExportFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'txt', label: 'TXT' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
]

type SubstituteToolbarProps = {
  selectedDates: Date[]
  exportFormat: SubstituteExportFormat
  isExporting: boolean
  selectedDateCount: number
  onSelectedDatesChange: (dates: Date[]) => void
  onExportFormatChange: (format: SubstituteExportFormat) => void
  onImportTomorrow: () => void
  onImportSelectedDates: () => void
  onExport: () => void
}

export function SubstituteToolbar({
  selectedDates,
  exportFormat,
  isExporting,
  selectedDateCount,
  onSelectedDatesChange,
  onExportFormatChange,
  onImportTomorrow,
  onImportSelectedDates,
  onExport,
}: SubstituteToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-5 py-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onImportTomorrow}>
          导入明日课程
        </Button>
        <div className="flex items-center">
          <Button type="button" variant="outline" className="rounded-r-none border-r-0" onClick={onImportSelectedDates}>
            导入多日课程
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="rounded-l-none" aria-label="选择多个日期" title="选择多个日期">
                <CalendarDays />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => onSelectedDatesChange(dates ?? [])}
                locale={zhCN}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        {selectedDateCount > 0 ? <span className="text-sm text-muted-foreground">已选 {selectedDateCount} 天</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={exportFormat} onValueChange={(value) => onExportFormatChange(value as SubstituteExportFormat)}>
          <SelectTrigger>
            <SelectValue placeholder="导出格式" />
          </SelectTrigger>
          <SelectContent>
            {exportOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={onExport} disabled={isExporting}>
          {isExporting ? '导出中...' : '导出当前记录'}
        </Button>
      </div>
    </div>
  )
}
