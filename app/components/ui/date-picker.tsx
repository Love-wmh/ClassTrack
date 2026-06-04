'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'

import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Calendar } from '~/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'

interface DatePickerProps {
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  showIcon?: boolean
}

export function DatePicker({ date, onSelect, placeholder, showIcon = true }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={'outline'} className={cn('w-[280px] justify-start text-left font-normal', !date && 'text-muted-foreground')}>
          {showIcon && <CalendarIcon className="mr-2 h-4 w-4" />}
          {date ? format(date, 'yyyy年MM月dd日', { locale: zhCN }) : <span>{placeholder || '选择日期'}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={onSelect} locale={zhCN} autoFocus />
      </PopoverContent>
    </Popover>
  )
}
