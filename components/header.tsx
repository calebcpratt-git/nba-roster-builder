'use client'

import Image from 'next/image'
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
import { ArrowLeftRight } from 'lucide-react'

export function Header() {
  const { selectedTeamAbbr, selectedTeam, setSelectedTeamAbbr } = useRoster()

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Image src="/logo.png" alt="NBA Roster Builder" width={48} height={48} />
          
          <div className="h-8 w-px bg-border" />
          
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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Build Trade
          </Button>
        </div>
      </div>
    </header>
  )
}
