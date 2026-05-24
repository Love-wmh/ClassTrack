import { cn } from '~/lib/utils'

export type ProfileTabItem = {
  key: string
  label: string
}

type ProfileTabsProps = {
  items: ProfileTabItem[]
  activeKey: string
  onChange: (key: string) => void
}

export default function ProfileTabs({ items, activeKey, onChange }: ProfileTabsProps) {
  return (
    <nav className="space-y-1 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
            activeKey === item.key ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
