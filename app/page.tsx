import { RosterProvider } from '@/lib/roster-context'
import { Header } from '@/components/header'
import { RosterTable } from '@/components/roster-table'
import { SavedContractsPanel } from '@/components/saved-contracts-panel'
import { ScaledWrapper } from '@/components/scaled-wrapper'

export default function Home() {
  return (
    <RosterProvider>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="px-4 py-6">
          <div className="flex items-start gap-4">
            {/* Main Content - Roster Table with integrated Cap Bars */}
            <ScaledWrapper scale={0.85}>
              <RosterTable />
            </ScaledWrapper>

            {/* Right Column - Saved Contracts */}
            <div className="flex-1 min-w-0">
              <SavedContractsPanel />
            </div>
          </div>
        </main>
      </div>
    </RosterProvider>
  )
}
