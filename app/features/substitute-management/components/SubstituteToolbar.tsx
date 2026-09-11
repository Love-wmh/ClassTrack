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
    <div className="flex flex-col items-stretch gap-3 rounded-md border bg-card p-3 shadow-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 sm:py-4">
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onImportTomorrow}>
          导入明日课程
        </Button>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] sm:flex sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-0 rounded-r-none border-r-0 px-2 sm:min-h-9 sm:px-4"
            onClick={onImportSelectedDates}
          >
            导入多日课程
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 rounded-l-none sm:size-9"
                aria-label="选择多个日期"
                title="选择多个日期"
              >
                <CalendarDays />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] overflow-x-auto p-0">
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
        {selectedDateCount > 0 ? (
          <span className="col-span-2 text-sm text-muted-foreground sm:col-auto">已选 {selectedDateCount} 天</span>
        ) : null}
      </div>

      <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
        <Select value={exportFormat} onValueChange={(value) => onExportFormatChange(value as SubstituteExportFormat)}>
          <SelectTrigger className="h-11 w-full min-w-0 sm:h-9 sm:w-auto">
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
        <Button type="button" className="min-h-11 min-w-0 px-2 sm:min-h-9 sm:px-4" onClick={onExport} disabled={isExporting}>
          {isExporting ? '导出中...' : '导出当前记录'}
        </Button>
      </div>
    </div>
  )
}
