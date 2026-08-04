'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRoster } from '@/lib/roster-context'
import { getTeamLogoUrl } from '@/lib/data'

export function MobileSheetTitle() {
  const { activeCapSheet, selectedTeam, selectedTeamAbbr, startNewCapSheet } = useRoster()

  if (!activeCapSheet) return null

  return (
    <div className="shrink-0 px-4 pt-3 flex flex-col gap-2">
      <Link href="/account" className="text-[11.5px] font-semibold text-muted-foreground w-fit">
        ‹ My Saved Cap Sheets
      </Link>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center p-[5px] box-border"
            style={{ background: `linear-gradient(135deg, ${selectedTeam.primaryColor}, ${selectedTeam.secondaryColor})` }}
          >
            <Image src={getTeamLogoUrl(selectedTeamAbbr)} alt={selectedTeamAbbr} width={20} height={20} className="object-contain" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold truncate">{activeCapSheet.name}</span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-[5px] bg-warning/15 text-warning shrink-0">
                SAVED
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              Editing{' '}
              <span className="font-bold" style={{ color: selectedTeam.primaryColor }}>
                · {selectedTeam.name}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={startNewCapSheet}
          className="shrink-0 border-none rounded-[9px] px-3 py-2 text-[11.5px] font-bold bg-card shadow-sm"
        >
          + New
        </button>
      </div>
    </div>
  )
}
