import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/utils'

export type TabItem = {
  key: string
  label: string
}

type SmoothTabsProps = {
  items: TabItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
  tabClassName?: string
  activeTabClassName?: string
  orientation?: 'horizontal' | 'vertical'
}

export default function SmoothTabs({
  items,
  activeKey,
  onChange,
  className,
  tabClassName,
  activeTabClassName,
  orientation = 'horizontal',
}: SmoothTabsProps) {
  const [indicator, setIndicator] = useState({ left: 0, width: 0, top: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const updateIndicator = useCallback(() => {
    const activeIndex = items.findIndex((item) => item.key === activeKey)
    const activeTab = tabRefs.current[activeIndex]
    if (activeIndex !== -1 && activeTab && containerRef.current) {
      setIndicator({
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
        top: activeTab.offsetTop,
        height: activeTab.offsetHeight,
      })
    }
  }, [activeKey, items])

  useEffect(() => {
    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [updateIndicator])

  const isVertical = orientation === 'vertical'

  return (
    <div ref={containerRef} className={cn('relative bg-muted text-primary rounded-md', isVertical ? 'inline-flex flex-col' : 'inline-flex', className)}>
      <div
        className="absolute bg-primary text-primary transition-all duration-300 ease-out shadow-sm pointer-events-none rounded-md"
        style={
          isVertical
            ? {
                left: 0,
                width: '100%',
                top: indicator.top,
                height: indicator.height,
              }
            : {
                left: indicator.left,
                width: indicator.width,
                top: 0,
                height: '100%',
              }
        }
      />

      <div className={cn('relative z-10', isVertical ? 'flex flex-col' : 'flex')}>
        {items.map((item, index) => (
          <button
            key={item.key}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'relative z-10 cursor-pointer rounded-xs px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              tabClassName,
              activeKey === item.key ? cn('text-primary-foreground', activeTabClassName) : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
