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
          <div className="flex gap-6 items-start">
            {/* Main Content - Roster Table with integrated Cap Bars */}
            <div className="origin-top-left scale-[0.7]">
              <RosterTable />
            </div>

            {/* Right Column - Saved Contracts */}
            <div className="origin-top-left scale-[0.7]">
              <SavedContractsPanel />
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
