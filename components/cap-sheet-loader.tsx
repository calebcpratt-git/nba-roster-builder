'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useRoster } from '@/lib/roster-context'
import { fetchCapSheet } from '@/lib/cap-sheets'

// Handles /?loadCapSheet=<id> — reopens a saved cap sheet from the My Account
// page into the builder, then strips the param from the URL.
export function CapSheetLoader() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { loadCapSheet } = useRoster()
  const handledId = useRef<string | null>(null)

  useEffect(() => {
    const id = searchParams.get('loadCapSheet')
    if (!id || handledId.current === id) return
    handledId.current = id

    fetchCapSheet(id)
      .then((sheet) => {
        if (sheet) loadCapSheet(sheet)
      })
      .finally(() => router.replace('/'))
  }, [searchParams, loadCapSheet, router])

  return null
}
