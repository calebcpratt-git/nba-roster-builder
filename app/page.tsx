import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'

export default function Home() {
  return (
    <RosterProvider>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container mx-auto px-4 py-6 max-w-[1600px]">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Content - Roster Table with integrated Cap Bars */}
            <div className="lg:col-span-3">
              <RosterTable />
            </div>

            {/* Right Column - Saved Contracts */}
            <div>
              <SavedContractsPanel />
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
