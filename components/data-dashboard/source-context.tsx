'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { DataSource } from '@/lib/data-schema'

export interface SourceFeed {
  entityId: string
  entityLabel: string
  path: string
}

interface SourceDataValue {
  sources: Record<string, DataSource>
  feeds: Record<string, SourceFeed[]>
}

const SourceDataContext = createContext<SourceDataValue | null>(null)

/** Makes DATA_SOURCES and fieldsBySource() available to every SourceLink in
 *  the tree without prop-drilling — both the overview ERD and the entity
 *  detail page's field table read the same source data. */
export function SourceDataProvider({
  sources,
  feeds,
  children,
}: SourceDataValue & { children: ReactNode }) {
  const value = useMemo(() => ({ sources, feeds }), [sources, feeds])
  return <SourceDataContext.Provider value={value}>{children}</SourceDataContext.Provider>
}

export function useSourceData(): SourceDataValue {
  const ctx = useContext(SourceDataContext)
  if (!ctx) throw new Error('useSourceData must be used within a SourceDataProvider')
  return ctx
}
