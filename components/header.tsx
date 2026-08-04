'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useRoster } from '@/lib/roster-context'
import { TEAMS, getTeamLogoUrl } from '@/lib/data'
import { TEAM_ABBREVIATIONS } from '@/lib/types'
import { getHeaderAccent } from '@/lib/team-theme'
import { Button } from '@/components/ui/button'
import { AuthPanel } from '@/components/auth-panel'
import { TintedLogo } from '@/components/tinted-logo'
import { cn } from '@/lib/utils'

export function Header() {
  const { user, loading } = useAuth()
  const { selectedTeamAbbr, selectedTeam, setSelectedTeamAbbr, activeCapSheet, hasUnsavedChanges, startNewCapSheet } = useRoster()
  const selectedTeamBtnRef = useRef<HTMLButtonElement>(null)
  const teamScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The scrollbar thumb only shows while actively scrolling — flag it via a
  // class instead of leaving it visible at rest, then fade it back out.
  const handleTeamRowScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    el.classList.add('is-scrolling')
    if (teamScrollTimeoutRef.current) clearTimeout(teamScrollTimeoutRef.current)
    teamScrollTimeoutRef.current = setTimeout(() => el.classList.remove('is-scrolling'), 800)
  }

  // A saved cap sheet is tied to whoever signed in to load it. If they sign
  // out mid-edit (here, or in another tab), drop back to the default builder
  // state instead of leaving someone else's — or their now-signed-out-self's —
  // sheet locked open on screen.
  useEffect(() => {
    if (!loading && !user && activeCapSheet) {
      startNewCapSheet()
    }
  }, [loading, user, activeCapSheet, startNewCapSheet])

  // The 30-team row overflows its container, so the selected badge can start
  // scrolled out of view — keep it in frame whenever the team changes.
  useEffect(() => {
    selectedTeamBtnRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selectedTeamAbbr])

  const headerAccent = getHeaderAccent(selectedTeam.primaryColor, selectedTeam.secondaryColor)

  return (
    <header className="border-b border-border bg-card">
      <div
        className="flex items-center gap-6 px-8 py-4"
        style={{ background: `linear-gradient(135deg, ${selectedTeam.primaryColor}, ${selectedTeam.secondaryColor})` }}
      >
        <div className="flex items-center gap-4 shrink-0">
          <TintedLogo color={headerAccent} size={40} className="shrink-0 object-contain" />
          <div>
            <div className="font-extrabold text-[18px] leading-tight tracking-tight text-white whitespace-nowrap" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
              Association GM
            </div>
            <div
              className="font-bold text-[9px] leading-tight uppercase tracking-widest mt-1 whitespace-nowrap"
              style={{ color: headerAccent }}
            >
              Pro Forma Cap Sheet
            </div>
          </div>
        </div>

        {activeCapSheet ? (
          <div className="flex items-center justify-center gap-5 flex-1 min-w-0">
            <Link
              href="/account"
              className="flex items-center gap-1.5 text-[13px] font-medium text-white/90 hover:text-white shrink-0"
            >
              <span className="text-sm">‹</span>
              My Saved Cap Sheets
            </Link>

            <span className="h-6 w-px bg-white/25 shrink-0" />

            <div className="flex items-center gap-4 shrink-0 min-w-0">
              <span
                className="h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0"
              >
                <Image
                  src={getTeamLogoUrl(selectedTeamAbbr)}
                  alt={selectedTeamAbbr}
                  width={24}
                  height={24}
                  className="object-contain"
                />
              </span>
              <div className="relative">
                <div className="font-bold text-[19px] text-white leading-tight whitespace-nowrap">
                  {activeCapSheet.name}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 text-[11px] font-medium text-white/70 leading-tight whitespace-nowrap">
                  {hasUnsavedChanges ? 'Editing' : 'Saved'}
                </div>
              </div>
              <span
                className="h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0"
              >
                <Image
                  src={getTeamLogoUrl(selectedTeamAbbr)}
                  alt={selectedTeamAbbr}
                  width={24}
                  height={24}
                  className="object-contain"
                />
              </span>
            </div>

            <span className="h-6 w-px bg-white/25 shrink-0 ml-4" />

            <Button
              size="sm"
              className="gap-1.5 shrink-0 rounded-full bg-white hover:bg-white/90 text-foreground shadow-sm px-4 ml-4"
              onClick={startNewCapSheet}
            >
              <span className="font-bold text-[15px] leading-none">+</span>
              Start New Cap Sheet
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2.5 overflow-x-auto min-w-0 flex-1 scrollbar-white-thin pb-1"
            onScroll={handleTeamRowScroll}
          >
            {TEAM_ABBREVIATIONS.map((abbr) => {
              const team = TEAMS[abbr]
              const isSelected = abbr === selectedTeamAbbr
              return (
                <button
                  key={abbr}
                  ref={isSelected ? selectedTeamBtnRef : undefined}
                  onClick={() => setSelectedTeamAbbr(abbr)}
                  title={team.name}
                  className={cn(
                    "shrink-0 transition-opacity",
                    !isSelected && "opacity-60 hover:opacity-90"
                  )}
                >
                  <span
                    className={cn(
                      "h-11 w-11 rounded-full flex items-center justify-center overflow-hidden border-2",
                      isSelected ? "bg-white" : "bg-white/10 border-transparent"
                    )}
                    style={isSelected ? { borderColor: '#ffffff' } : undefined}
                  >
                    <Image
                      src={getTeamLogoUrl(abbr)}
                      alt={abbr}
                      width={28}
                      height={28}
                      className="object-contain"
                    />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="shrink-0 ml-auto">
          <AuthPanel />
        </div>
      </div>
    </header>
  )
}
