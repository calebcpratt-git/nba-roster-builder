'use client'

import { Suspense } from 'react'
import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { SignFreeAgentsPanel } from '@/components/sign-free-agents-panel'
import { TradesPanel } from '@/components/trades-panel'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'
import { SigningExceptionsPanel } from '@/components/signing-exceptions-panel'
import { TradeExceptionsPanel } from '@/components/trade-exceptions-panel'
import { CapSheetLoader } from '@/components/cap-sheet-loader'
import { MobileBuilder } from '@/components/mobile/mobile-builder'
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
          <>
            <div className="shrink-0">
              <Header />
            </div>

            <main className="flex-1 min-h-0 px-4 py-6">
              <div className="flex items-start gap-4 w-full h-full">
                {/* Left Column - Roster Table - 50% width */}
                <div className="flex-1 min-w-0 h-full">
                  <RosterTable />
                </div>

                {/* Right Column - Sign Free Agents, Trades, and Saved Contracts - 50% width */}
                <div className="flex-1 min-w-0 h-full overflow-y-auto space-y-4">
                  <SignFreeAgentsPanel />
                  <TradesPanel />
                  <SavedContractsPanel />
                  <SigningExceptionsPanel />
                  <TradeExceptionsPanel />
                </div>
              </div>
            </main>
          </>
        )}
      </div>
    </RosterProvider>
  )
}
