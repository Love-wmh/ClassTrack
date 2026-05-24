import { Outlet } from 'react-router'
import { Calendar, User, GraduationCap } from 'lucide-react'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import NavItem from './NavItem'

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">ClassTrack</h1>
              <p className="text-xs text-gray-500">课程表管理</p>
            </div>
          </div>
        </div>

        <Separator className="mx-4" />

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            <NavItem to="/" icon={<Calendar className="w-5 h-5" />} label="课程表" />
            <NavItem to="/profile" icon={<User className="w-5 h-5" />} label="个人中心" />
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
