import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { SignFreeAgentsPanel } from '@/components/sign-free-agents-panel'
import { TradesPanel } from '@/components/trades-panel'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'

export default function Home() {
  return (
    <RosterProvider>
      <div className="min-h-screen bg-background">
        <Header />

        <main className="px-4 py-6">
          <div className="flex items-start gap-4 w-full">
            {/* Left Column - Roster Table - 50% width */}
            <div className="flex-1 min-w-0">
              <RosterTable />
            </div>

            {/* Right Column - Sign Free Agents, Trades, and Saved Contracts - 50% width */}
            <div className="flex-1 min-w-0 space-y-4">
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
