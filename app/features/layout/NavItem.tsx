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
          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}
