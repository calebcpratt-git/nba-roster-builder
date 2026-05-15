import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { CapProjectionChart } from '@/components/cap-projection-chart'
import { RosterTable } from '@/components/roster-table'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'

export default function Home() {
  return (
    <RosterProvider>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container mx-auto px-4 py-6 max-w-[1600px]">
          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - Roster and Chart */}
            <div className="lg:col-span-3 space-y-6">
              <RosterTable />
              <CapProjectionChart />
            </div>

            {/* Right Column - Saved Contracts */}
            <div className="space-y-6">
              <SavedContractsPanel />
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
