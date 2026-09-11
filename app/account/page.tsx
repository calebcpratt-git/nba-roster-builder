'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { fetchCapSheets, deleteCapSheet } from '@/lib/cap-sheets'
import { CapSheet } from '@/lib/types'
import { TEAMS } from '@/lib/data'
import { CapSheetCard } from '@/components/cap-sheet-card'
import { TintedLogo } from '@/components/tinted-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

// Fixed brand banner colors for this page — unlike the builder header, the
// account page has no selected team in context to theme itself around.
const BRAND_PRIMARY = '#007A33'
const BRAND_SECONDARY = '#BA9653'

type SortOption = 'newest' | 'name' | 'team'
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
  { value: 'team', label: 'Team' },
]

function getInitials(user: { email?: string | null; user_metadata?: { full_name?: string; name?: string } }): string {
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase()
  }
  return user.email ? user.email.slice(0, 2).toUpperCase() : '?'
}

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [capSheets, setCapSheets] = useState<CapSheet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')

  useEffect(() => {
    if (!user) return
    fetchCapSheets()
      .then(setCapSheets)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cap sheets'))
  }, [user])

  const visibleCapSheets = useMemo(() => {
    if (!capSheets) return capSheets
    const query = search.trim().toLowerCase()
    const filtered = query
      ? capSheets.filter((sheet) => {
          const team = TEAMS[sheet.teamAbbr]
          const teamLabel = team ? `${team.city} ${team.name}` : sheet.teamAbbr
          return sheet.name.toLowerCase().includes(query) || teamLabel.toLowerCase().includes(query)
        })
      : capSheets

    const sorted = [...filtered]
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'team') {
      sorted.sort((a, b) => {
        const aTeam = TEAMS[a.teamAbbr]
        const bTeam = TEAMS[b.teamAbbr]
        const aLabel = aTeam ? `${aTeam.city} ${aTeam.name}` : a.teamAbbr
        const bLabel = bTeam ? `${bTeam.city} ${bTeam.name}` : b.teamAbbr
        return aLabel.localeCompare(bLabel)
      })
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    return sorted
  }, [capSheets, search, sortBy])

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
      <header
        className="border-b border-border"
        style={{ background: `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY})` }}
      >
        <div className="flex items-center gap-3 px-6 py-4">
          <span className="h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
            <TintedLogo color={BRAND_PRIMARY} size={22} />
          </span>
          <div className="min-w-0">
            <div
              className="font-extrabold text-[15px] leading-tight tracking-tight text-white whitespace-nowrap"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
            >
              Association GM
            </div>
            <div className="font-bold text-[9px] leading-tight uppercase tracking-widest mt-0.5 text-white/80">
              My Account
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {user && (
              <div
                className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold shrink-0"
                title={user.email ?? undefined}
              >
                {getInitials(user)}
              </div>
            )}
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2 bg-white/95 hover:bg-white text-foreground border-transparent">
                <ArrowLeft className="h-4 w-4" />
                Back to Builder
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold mb-1">Saved Cap Sheets</h2>
          {capSheets && capSheets.length > 0 && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {capSheets.length} sheet{capSheets.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Pro forma cap tables you've saved while building out rosters. Click one to reopen it.
        </p>

        {capSheets && capSheets.length > 0 && (
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <Input
              placeholder="Search by name or team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by</span>
              <div className="flex items-center gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSortBy(opt.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      sortBy === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
        ) : visibleCapSheets && visibleCapSheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved cap sheets match "{search}".</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCapSheets?.map((sheet) => (
              <CapSheetCard key={sheet.id} sheet={sheet} onOpen={handleOpen} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
