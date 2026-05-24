import { Outlet } from 'react-router'
import { Calendar, Database, User, GraduationCap } from 'lucide-react'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import { useClassStore } from '~/store'
import NavItem from './NavItem'

const navItems = [
  {
    to: '/',
    icon: <Calendar className="w-5 h-5" />,
    label: '课程表',
  },
  {
    to: '/data-management',
    icon: <Database className="w-5 h-5" />,
    label: '数据管理',
  },
  {
    to: '/profile',
    icon: <User className="w-5 h-5" />,
    label: '个人中心',
  },
]

export default function AppLayout() {
  const school = useClassStore((state) => state.school)

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5">
          <div className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50/80 px-3 py-3 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-200 text-black shadow-sm shadow-gray-200">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-gray-900">ClassTrack</h1>
              <p className="truncate text-xs text-gray-500">{school?.name || '请选择学校'}</p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} />
            ))}
          </nav>
        </ScrollArea>

        <Separator className="mx-4" />
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
