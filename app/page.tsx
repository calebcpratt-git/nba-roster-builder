import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { CapProjectionChart } from '@/components/cap-projection-chart'
import { RosterTable } from '@/components/roster-table'
import { CapSummaryCards } from '@/components/cap-summary-cards'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'
import { CapThresholdsLegend } from '@/components/cap-thresholds-legend'

export default function Home() {
  return (
    <RosterProvider>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container mx-auto px-4 py-6 max-w-[1600px]">
          {/* Cap Summary Row */}
          <div className="mb-6">
            <CapSummaryCards />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - Chart and Roster */}
            <div className="lg:col-span-3 space-y-6">
              <CapProjectionChart />
              <RosterTable />
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              <CapThresholdsLegend />
              <SavedContractsPanel />
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
