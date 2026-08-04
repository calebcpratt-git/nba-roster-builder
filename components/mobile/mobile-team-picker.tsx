'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRoster } from '@/lib/roster-context'
import { TEAMS, getTeamLogoUrl } from '@/lib/data'
import { TEAM_ABBREVIATIONS } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function MobileTeamPicker() {
  const { selectedTeamAbbr, selectedTeam, setSelectedTeamAbbr } = useRoster()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="shrink-0 px-4 pt-3">
      <button
        onClick={() => setIsOpen(true)}
        className="w-full border border-border rounded-[10px] px-3 py-2 text-[13px] font-semibold bg-card flex items-center gap-2.5"
      >
        <Image
          src={getTeamLogoUrl(selectedTeamAbbr)}
          alt={selectedTeamAbbr}
          width={24}
          height={24}
          className="object-contain shrink-0"
        />
        <span className="flex-1 text-left truncate">{selectedTeam.city} {selectedTeam.name}</span>
        <span className="shrink-0 text-muted-foreground text-xs">▾</span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[320px] p-0 gap-0 max-h-[420px] flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3.5 border-b border-border shrink-0">
            <DialogTitle className="text-sm">Select Team</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            {TEAM_ABBREVIATIONS.map((abbr) => {
              const team = TEAMS[abbr]
              const isSelected = abbr === selectedTeamAbbr
              return (
                <button
                  key={abbr}
                  onClick={() => { setSelectedTeamAbbr(abbr); setIsOpen(false) }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0",
                    isSelected && "bg-accent"
                  )}
                >
                  <Image src={getTeamLogoUrl(abbr)} alt={abbr} width={30} height={30} className="object-contain shrink-0" />
                  <span
                    className={cn("text-sm", isSelected ? "font-bold" : "font-medium")}
                    style={isSelected ? { color: team.primaryColor } : undefined}
                  >
                    {team.city} {team.name}
                  </span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
