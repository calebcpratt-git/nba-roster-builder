'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useRoster } from '@/lib/roster-context'
import { getHeaderAccent } from '@/lib/team-theme'
import { TintedLogo } from '@/components/tinted-logo'
import { AuthFormContent } from '@/components/auth-panel'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

function MobileAccountControl() {
  const { user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (!user) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button className="shrink-0 bg-transparent text-white/88 font-bold text-[11.5px] px-1">
            Sign In
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <AuthFormContent onSuccess={() => setIsOpen(false)} />
        </PopoverContent>
      </Popover>
    )
  }

  const initial = user.email?.[0]?.toUpperCase() ?? '?'

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="h-8 w-8 rounded-full border-[1.5px] border-white/50 bg-white/18 text-white font-bold text-xs flex items-center justify-center shrink-0">
          {initial}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[164px] p-0 overflow-hidden">
        <Link
          href="/account"
          onClick={() => setIsOpen(false)}
          className="block px-3.5 py-2.5 text-[13px] font-semibold border-b border-border hover:bg-accent"
        >
          My Account
        </Link>
        <button
          onClick={() => { setIsOpen(false); signOut() }}
          className="block w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-destructive hover:bg-accent"
        >
          Sign Out
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function MobileHeader() {
  const { selectedTeam } = useRoster()
  const accent = getHeaderAccent(selectedTeam.primaryColor, selectedTeam.secondaryColor)

  return (
    <div
      className="shrink-0 flex items-center justify-between gap-3 px-5 pb-3.5"
      style={{
        background: `linear-gradient(135deg, ${selectedTeam.primaryColor}, ${selectedTeam.secondaryColor})`,
        paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <TintedLogo color={accent} size={34} className="shrink-0 object-contain" />
        <div
          className="font-extrabold text-lg leading-tight truncate"
          style={{ color: accent }}
        >
          Association GM
        </div>
      </div>
      <MobileAccountControl />
    </div>
  )
}
