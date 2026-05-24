import React from 'react'
import { NavLink } from 'react-router'
import { cn } from '~/lib/utils'

type NavItemProps = {
  to: string
  icon: React.ReactNode
  label: string
}

export default function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isActive ? 'bg-gray-100 text-gray-950' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}
