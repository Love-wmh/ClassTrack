import { useEffect } from 'react'

type UseWeekKeyboardNavigationOptions = {
  currentWeek: number
  maxWeek: number
  onWeekChange: (week: number) => void
}

const editableElementSelector = 'input, textarea, select, [contenteditable="true"]'

function isEditingElement(target: EventTarget | null) {
  return target instanceof Element && target.closest(editableElementSelector) !== null
}

export function useWeekKeyboardNavigation({ currentWeek, maxWeek, onWeekChange }: UseWeekKeyboardNavigationOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingElement(event.target)) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onWeekChange(Math.max(1, currentWeek - 1))
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onWeekChange(Math.min(maxWeek, currentWeek + 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentWeek, maxWeek, onWeekChange])
}
