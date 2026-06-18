import { format } from 'date-fns'
import { DatePicker } from '~/components/ui/date-picker'

type FirstWeekStartDatePickerProps = {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  showIcon?: boolean
  className?: string
}

export default function FirstWeekStartDatePicker({
  value,
  onChange,
  placeholder = '选择日期',
  showIcon = true,
  className,
}: FirstWeekStartDatePickerProps) {
  const date = value ? new Date(`${value}T00:00:00`) : undefined

  const handleSelect = (selectedDate: Date | undefined) => {
    onChange(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null)
  }

  return <DatePicker date={date} onSelect={handleSelect} placeholder={placeholder} showIcon={showIcon} className={className} />
}
