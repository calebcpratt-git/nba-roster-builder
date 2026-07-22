import { createClient } from './supabase/client'
import type { CapSheet, CapSheetSnapshot, CapSheetSummary } from './types'

type CapSheetRow = {
  id: string
  user_id: string
  team_abbr: string
  name: string
  snapshot: CapSheetSnapshot
  summary: CapSheetSummary
  created_at: string
  updated_at: string
}

function fromRow(row: CapSheetRow): CapSheet {
  return {
    id: row.id,
    userId: row.user_id,
    teamAbbr: row.team_abbr,
    name: row.name,
    snapshot: row.snapshot,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchCapSheets(): Promise<CapSheet[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('cap_sheets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as CapSheetRow[]).map(fromRow)
}

export async function fetchCapSheet(id: string): Promise<CapSheet | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('cap_sheets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? fromRow(data as CapSheetRow) : null
}

export async function createCapSheet(input: {
  teamAbbr: string
  name: string
  snapshot: CapSheetSnapshot
  summary: CapSheetSummary
}): Promise<CapSheet> {
  const supabase = createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('Must be signed in to save a cap sheet')

  const { data, error } = await supabase
    .from('cap_sheets')
    .insert({
      user_id: userId,
      team_abbr: input.teamAbbr,
      name: input.name,
      snapshot: input.snapshot,
      summary: input.summary,
    })
    .select('*')
    .single()

  if (error) throw error
  return fromRow(data as CapSheetRow)
}

export async function updateCapSheet(
  id: string,
  input: { snapshot: CapSheetSnapshot; summary: CapSheetSummary }
): Promise<CapSheet> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('cap_sheets')
    .update({
      snapshot: input.snapshot,
      summary: input.summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return fromRow(data as CapSheetRow)
}

export async function deleteCapSheet(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('cap_sheets').delete().eq('id', id)
  if (error) throw error
}
