import type { ChangeEvent, RefObject } from 'react'
import { FileSelector } from '~/components/common/FileSelector'
import FirstWeekStartDatePicker from '~/components/common/FirstWeekStartDatePicker'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { parsers } from '~/lib/parsers'

type ParserImportStepProps = {
  inputRef: RefObject<HTMLInputElement | null>
  fileName?: string
  selectedParserId: string | null
  firstWeekStartDate: string | null
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onParserChange: (parserId: string) => void
  onFirstWeekStartDateChange: (date: string | null) => void
}

export function ParserImportStep({
  inputRef,
  fileName,
  selectedParserId,
  firstWeekStartDate,
  onFileChange,
  onParserChange,
  onFirstWeekStartDateChange,
}: ParserImportStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="file">课程表 JSON 文件</Label>
        <FileSelector
          ref={inputRef}
          id="file"
          accept=".json"
          fileName={fileName}
          placeholder="请选择书签脚本导出的 JSON 文件"
          onChange={onFileChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="parser">解析器</Label>
        <Select value={selectedParserId || ''} onValueChange={onParserChange}>
          <SelectTrigger id="parser">
            <SelectValue placeholder="请选择解析器" />
          </SelectTrigger>
          <SelectContent>
            {parsers.map((parser) => (
              <SelectItem key={parser.id} value={parser.id}>
                {parser.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedParserId && (
          <p className="text-sm text-muted-foreground">{parsers.find((parser) => parser.id === selectedParserId)?.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="first-week-start-date">第一周第一天</Label>
        <FirstWeekStartDatePicker
          value={firstWeekStartDate}
          onChange={onFirstWeekStartDateChange}
          placeholder="请选择第一周第一天"
          showIcon={false}
        />
        <p className="text-sm text-muted-foreground">用于按导入时刻自动标记已上课程，请选择本学期第一周的周一。</p>
      </div>
    </div>
  )
}
