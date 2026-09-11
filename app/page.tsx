'use client'

import { Suspense } from 'react'
import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { CapSheetLoader } from '@/components/cap-sheet-loader'
import { SpecTooltipHost } from '@/components/desktop/spec-tooltip'
import { DesktopFreeAgentsPanel } from '@/components/desktop/free-agents-panel'
import { DesktopTradesPanel } from '@/components/desktop/trades-panel'
import { MobileBuilder } from '@/components/mobile/mobile-builder'
import { GmChat } from '@/components/gm-chat/gm-chat'
import { useIsMobile } from '@/hooks/use-mobile'

export default function Home() {
  const isMobile = useIsMobile()

  return (
    <RosterProvider>
      <div className="h-screen flex flex-col bg-background">
        <Suspense fallback={null}>
          <CapSheetLoader />
        </Suspense>

        {isMobile ? (
          <MobileBuilder />
        ) : (
          <SpecTooltipHost>
            <div className="shrink-0">
              <Header />
            </div>

            <main className="flex-1 min-h-0 px-4 py-6">
              <div className="flex items-start gap-4 w-full h-full">
                {/* 50/50 at every width — the page itself never scrolls; the
                    table and both panels scroll internally. */}
                <div className="flex-1 min-w-0 h-full">
                  <RosterTable />
                </div>

                <div className="flex-1 min-w-0 h-full flex flex-col gap-4 text-[13px]">
                  <DesktopFreeAgentsPanel />
                  <DesktopTradesPanel />
                </div>
              </div>
            </main>
          </SpecTooltipHost>
        )}

        <GmChat surface="home" />
      </div>
    </RosterProvider>
  )
}
