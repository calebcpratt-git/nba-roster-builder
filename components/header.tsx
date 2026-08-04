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
import { FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Header() {
  const { user, loading } = useAuth()
  const { selectedTeamAbbr, selectedTeam, setSelectedTeamAbbr, activeCapSheet, startNewCapSheet } = useRoster()
  const selectedTeamBtnRef = useRef<HTMLButtonElement>(null)

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
        className="flex items-center justify-between px-8 py-6"
        style={{ background: `linear-gradient(135deg, ${selectedTeam.primaryColor}, ${selectedTeam.secondaryColor})` }}
      >
        <div className="flex items-center gap-4">
          <TintedLogo color={headerAccent} size={52} className="shrink-0 object-contain" />
          <div>
            <div className="font-extrabold text-[26px] leading-tight tracking-tight text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
              Association GM
            </div>
            <div
              className="font-bold text-[12px] leading-tight uppercase tracking-widest mt-1.5"
              style={{ color: headerAccent }}
            >
              Pro Forma Cap Sheet
            </div>
          </div>
        </div>

        <AuthPanel />
      </div>

      {activeCapSheet ? (
        <div className="h-[91px] px-6 flex items-center justify-between bg-card">
          <Link
            href="/account"
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground shrink-0"
          >
            <span className="text-sm font-bold">‹</span>
            My Saved Cap Sheets
          </Link>

          <div className="flex items-center">
            <span
              className="h-5 w-5 rounded-full bg-card border-[1.5px] flex items-center justify-center overflow-hidden mr-6 shrink-0"
              style={{ borderColor: selectedTeam.primaryColor }}
            >
              <Image
                src={getTeamLogoUrl(selectedTeamAbbr)}
                alt={selectedTeamAbbr}
                width={14}
                height={14}
                className="object-contain"
              />
            </span>
            <div className="relative">
              <span className="font-bold text-[15px] text-foreground whitespace-nowrap">
                {activeCapSheet.name}
              </span>
              <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                Editing
              </span>
            </div>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-6 tracking-wide bg-warning/15 text-warning"
            >
              SAVED
            </span>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={startNewCapSheet}>
            <FilePlus2 className="h-3.5 w-3.5" />
            Start New Cap Sheet
          </Button>
        </div>
      ) : (
        <div className="h-[91px] px-6 flex items-center overflow-x-auto border-t border-border bg-card">
          <div className="flex items-center gap-2 mx-auto">
            {TEAM_ABBREVIATIONS.map((abbr) => {
              const team = TEAMS[abbr]
              const isSelected = abbr === selectedTeamAbbr
              return (
                <button
                  key={abbr}
                  ref={isSelected ? selectedTeamBtnRef : undefined}
                  onClick={() => setSelectedTeamAbbr(abbr)}
                  className={cn(
                    "flex flex-col items-center gap-1 shrink-0 transition-opacity",
                    !isSelected && "opacity-50 hover:opacity-75"
                  )}
                >
                  <span
                    className={cn(
                      "h-[52px] w-[52px] rounded-full flex items-center justify-center overflow-hidden border-2",
                      isSelected ? "bg-white" : "bg-background border-transparent"
                    )}
                    style={isSelected ? { borderColor: team.primaryColor } : undefined}
                  >
                    <Image
                      src={getTeamLogoUrl(abbr)}
                      alt={abbr}
                      width={32}
                      height={32}
                      className="object-contain"
                    />
                  </span>
                  <span className={cn(
                    "text-[9.5px] whitespace-nowrap",
                    isSelected ? "font-bold text-foreground" : "font-semibold text-muted-foreground"
                  )}>
                    {team.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}
