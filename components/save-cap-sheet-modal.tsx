'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRoster } from '@/lib/roster-context'
import { createCapSheet, updateCapSheet } from '@/lib/cap-sheets'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save } from 'lucide-react'

export function SaveCapSheetButton() {
  const { user } = useAuth()
  const {
    selectedTeam,
    selectedTeamAbbr,
    hasUnsavedChanges,
    activeCapSheet,
    buildCapSheetPayload,
    markCapSheetSaved,
  } = useRoster()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  const openCreateModal = () => {
    setName(`${selectedTeam.city} ${selectedTeam.name} Cap Sheet`)
    setError(null)
    setIsOpen(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { snapshot, summary } = buildCapSheetPayload()
      const sheet = await createCapSheet({ teamAbbr: selectedTeamAbbr, name: name.trim(), snapshot, summary })
      markCapSheetSaved({ id: sheet.id, name: sheet.name })
      setIsOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save cap sheet')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!activeCapSheet) return
    setSaving(true)
    setError(null)
    try {
      const { snapshot, summary } = buildCapSheetPayload()
      const sheet = await updateCapSheet(activeCapSheet.id, { snapshot, summary })
      markCapSheetSaved({ id: sheet.id, name: sheet.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update cap sheet')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {activeCapSheet && (
          <span className="text-[10px] text-muted-foreground">
            Editing <span className="font-medium text-foreground">{activeCapSheet.name}</span>
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[10px]"
          disabled={!hasUnsavedChanges || saving}
          onClick={activeCapSheet ? handleUpdate : openCreateModal}
        >
          <Save className="h-3 w-3" />
          {saving ? 'Saving...' : activeCapSheet ? 'Update Cap Sheet' : 'Save Cap Sheet'}
        </Button>
        {error && !isOpen && <span className="text-[10px] text-red-500">{error}</span>}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Cap Sheet</DialogTitle>
            <DialogDescription>
              Save the {selectedTeam.city} {selectedTeam.name} cap table so you can find it later on your My Account page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cap-sheet-name" className="text-xs">
              Name
            </Label>
            <Input
              id="cap-sheet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Offseason Plan A"
              className="h-8 text-sm"
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1 h-8 text-sm" disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="flex-1 h-8 text-sm" disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
