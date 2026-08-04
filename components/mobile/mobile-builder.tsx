'use client'

import { useRoster } from '@/lib/roster-context'
import { MobileHeader } from '@/components/mobile/mobile-header'
import { MobileTeamPicker } from '@/components/mobile/mobile-team-picker'
import { MobileSheetTitle } from '@/components/mobile/mobile-sheet-title'
import { MobilePanelTabs } from '@/components/mobile/mobile-panel-tabs'
import { MobileRosterTable } from '@/components/mobile/mobile-roster-table'

export function MobileBuilder() {
  const { activeCapSheet } = useRoster()

  return (
    <div className="h-full flex flex-col bg-[#F2F2F7] dark:bg-background">
      <MobileHeader />
      {activeCapSheet ? <MobileSheetTitle /> : <MobileTeamPicker />}
      <MobilePanelTabs />
      <MobileRosterTable />
    </div>
  )
}
