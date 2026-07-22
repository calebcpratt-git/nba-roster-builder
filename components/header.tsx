'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useRoster } from '@/lib/roster-context'
import { TEAMS } from '@/lib/data'
import { TEAM_ABBREVIATIONS } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AuthPanel } from '@/components/auth-panel'
import { ArrowLeftRight, FilePlus2, FolderOpen } from 'lucide-react'
import Link from 'next/link'

export function Header() {
  const { user, loading } = useAuth()
  const { selectedTeamAbbr, selectedTeam, setSelectedTeamAbbr, activeCapSheet, startNewCapSheet } = useRoster()

  // A saved cap sheet is tied to whoever signed in to load it. If they sign
  // out mid-edit (here, or in another tab), drop back to the default builder
  // state instead of leaving someone else's — or their now-signed-out-self's —
  // sheet locked open on screen.
  useEffect(() => {
    if (!loading && !user && activeCapSheet) {
      startNewCapSheet()
    }
  }, [loading, user, activeCapSheet, startNewCapSheet])

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Image src="/logo.png" alt="NBA Roster Builder" width={48} height={48} />

          <div className="h-8 w-px bg-border" />

          <AuthPanel />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Build Trade
          </Button>
        </div>
      </div>

      {activeCapSheet ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-3 bg-primary/10 border-t border-primary/20">
          <span />
          <span className="text-lg font-semibold text-foreground truncate max-w-full justify-self-center">
            {activeCapSheet.name}
          </span>
          <div className="flex items-center gap-2 justify-self-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 px-2 text-xs shrink-0"
              onClick={startNewCapSheet}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              Start New Cap Sheet
            </Button>
            <Link href="/account" className="shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5 h-7 px-2 text-xs">
                <FolderOpen className="h-3.5 w-3.5" />
                My Saved Cap Sheets
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-6 py-3 border-t border-border">
          <Select
            value={selectedTeamAbbr}
            onValueChange={(value) => setSelectedTeamAbbr(value)}
          >
            <SelectTrigger className="w-[220px] bg-secondary border-border">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {TEAM_ABBREVIATIONS.map((abbr) => {
                const team = TEAMS[abbr]
                return (
                  <SelectItem key={abbr} value={abbr}>
                    {team?.city} {team?.name}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </header>
  )
}
