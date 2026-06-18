import type { Semester } from '~/lib/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

type SemesterSelectProps = {
  semesters: Semester[]
  currentSemesterId: string | null
  onSemesterChange: (semesterId: string) => void
}

export default function SemesterSelect({ semesters, currentSemesterId, onSemesterChange }: SemesterSelectProps) {
  const hasSemesters = semesters.length > 0

  return (
    <Select value={currentSemesterId || undefined} onValueChange={onSemesterChange} disabled={!hasSemesters}>
      <SelectTrigger className="h-9 w-[220px] max-w-full justify-between">
        <SelectValue placeholder={hasSemesters ? '选择学期' : '暂无学期'} />
      </SelectTrigger>
      <SelectContent align="end">
        {semesters.map((semester) => (
          <SelectItem key={semester.id} value={semester.id}>
            {semester.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
