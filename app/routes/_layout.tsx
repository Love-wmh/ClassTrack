
import React from 'react';
import { NavLink } from 'react-router';
import { Calendar, User, GraduationCap } from 'lucide-react';
import { cn } from '~/lib/utils';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Separator } from '~/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { useClassStore } from '~/store/classStore';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { school } = useClassStore();

  return (
    <div className='flex h-screen bg-gray-50'>
      {/* 侧边栏 */}
      <aside className='w-64 bg-white border-r border-gray-200 flex flex-col'>
        {/* Logo */}
        <div className='p-6'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center'>
              <GraduationCap className='w-6 h-6 text-white' />
            </div>
            <div>
              <h1 className='text-lg font-bold text-gray-800'>ClassTrack</h1>
              <p className='text-xs text-gray-500'>课程表管理</p>
            </div>
          </div>
        </div>

        <Separator className='mx-4' />

        {/* 导航菜单 */}
        <ScrollArea className='flex-1 px-3 py-4'>
          <nav className='space-y-1'>
            <NavItem
              to='/'
              icon={<Calendar className='w-5 h-5' />}
              label='课程表'
            />
            <NavItem
              to='/profile'
              icon={<User className='w-5 h-5' />}
              label='个人中心'
            />
          </nav>
        </ScrollArea>

        <Separator className='mx-4' />

        {/* 用户信息 */}
        <div className='p-4'>
          <div className='flex items-center gap-3'>
            <Avatar className='h-10 w-10'>
              <AvatarImage src='' />
              <AvatarFallback className='bg-blue-100 text-blue-600 font-semibold'>
                {school?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-medium text-gray-800 truncate'>
                {school?.name || '未登录'}
              </p>
              <p className='text-xs text-gray-500 truncate'>
                {school ? '已导入课程' : '请先导入课程'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区域 */}
      <main className='flex-1 overflow-hidden'>
        {children}
      </main>
    </div>
  );
}

// 导航项组件
function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

