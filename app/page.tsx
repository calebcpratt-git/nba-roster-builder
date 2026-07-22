import { Suspense } from 'react'
import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { SignFreeAgentsPanel } from '@/components/sign-free-agents-panel'
import { TradesPanel } from '@/components/trades-panel'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'
import { CapSheetLoader } from '@/components/cap-sheet-loader'

export default function Home() {
  return (
    <RosterProvider>
      <div className="h-screen flex flex-col bg-background">
        <Suspense fallback={null}>
          <CapSheetLoader />
        </Suspense>
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
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
