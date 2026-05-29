import { Outlet } from 'react-router'
import { BarChart3, Calendar, Database, User, GraduationCap } from 'lucide-react'
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
    to: '/dashboard',
    icon: <BarChart3 className="w-5 h-5" />,
    label: '数据看板',
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
    <div className="flex h-screen bg-background">
      <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="px-4 py-5">
          <div className="flex items-center gap-3 rounded-md border border-sidebar-border bg-white/70 px-3 py-3 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">ClassTrack</h1>
              <p className="truncate text-xs text-muted-foreground">{school?.name || '请选择学校'}</p>
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
