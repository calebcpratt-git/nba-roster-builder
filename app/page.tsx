import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'

export default function Home() {
  return (
    <RosterProvider>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="px-4 py-6">
          <div className="flex items-start">
            {/* Main Content - Roster Table with integrated Cap Bars */}
            <div className="origin-top-left scale-[0.85]" style={{ width: 'fit-content' }}>
              <RosterTable />
            </div>

            {/* Right Column - Saved Contracts - positioned with negative margin to account for scale */}
            <div className="flex-1 min-w-0 -ml-[15%]">
              <SavedContractsPanel />
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
