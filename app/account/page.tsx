'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { fetchCapSheets, deleteCapSheet } from '@/lib/cap-sheets'
import { CapSheet } from '@/lib/types'
import { CapSheetCard } from '@/components/cap-sheet-card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [capSheets, setCapSheets] = useState<CapSheet[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetchCapSheets()
      .then(setCapSheets)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cap sheets'))
  }, [user])

  const handleOpen = (sheet: CapSheet) => {
    router.push(`/?loadCapSheet=${sheet.id}`)
  }

  const handleDelete = async (id: string) => {
    const previous = capSheets
    setCapSheets((prev) => (prev ? prev.filter((s) => s.id !== id) : prev))
    try {
      await deleteCapSheet(id)
    } catch (e) {
      setCapSheets(previous ?? null)
      setError(e instanceof Error ? e.message : 'Failed to delete cap sheet')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="flex items-center gap-3 px-6 py-4">
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Builder
            </Button>
          </Link>
          <h1 className="text-sm font-medium">My Account</h1>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        <h2 className="text-lg font-semibold mb-1">Saved Cap Sheets</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Pro forma cap tables you've saved while building out rosters. Click one to reopen it.
        </p>

        {authLoading || (user && capSheets === null && !error) ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !user ? (
          <p className="text-sm text-muted-foreground">
            Sign in to view your saved cap sheets.
          </p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : capSheets && capSheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved cap sheets yet. Open a team, make some changes, and use "Save Cap Sheet" at the top of the roster table.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {capSheets?.map((sheet) => (
              <CapSheetCard key={sheet.id} sheet={sheet} onOpen={handleOpen} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
