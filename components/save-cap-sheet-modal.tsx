'use client'

import { useEffect, useState } from 'react'
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
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth()
  const {
    selectedTeam,
    selectedTeamAbbr,
    hasUnsavedChanges,
    activeCapSheet,
    pendingSaveIntent,
    buildCapSheetPayload,
    markCapSheetSaved,
    persistDraftForAuthRedirect,
    consumePendingSaveIntent,
  } = useRoster()
  const [isOpen, setIsOpen] = useState(false)
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)

  // Signing in elsewhere (another tab, or via the prompt below) should
  // dismiss the prompt automatically instead of leaving it stuck open.
  useEffect(() => {
    if (user) setShowSignInPrompt(false)
  }, [user])

  // Covers the Google redirect round trip: persistDraftForAuthRedirect
  // stashed pendingSaveIntent before leaving, and the roster provider
  // restored it into state on the way back. Once we know who's signed in,
  // pick the save-name dialog back up where the user left off.
  useEffect(() => {
    if (!loading && user && pendingSaveIntent) {
      consumePendingSaveIntent()
      openCreateModal()
    }
  }, [loading, user, pendingSaveIntent])

  const openCreateModal = () => {
    setName(`${selectedTeam.city} ${selectedTeam.name} Cap Sheet`)
    setError(null)
    setIsOpen(true)
  }

  const handleSaveClick = () => {
    if (!user) {
      setAuthMode('signin')
      setAuthEmail('')
      setAuthPassword('')
      setAuthError(null)
      setAuthMessage(null)
      setShowSignInPrompt(true)
      return
    }
    if (activeCapSheet) {
      handleUpdate()
    } else {
      openCreateModal()
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthMessage(null)
    setAuthSubmitting(true)
    try {
      if (authMode === 'signin') {
        const { error } = await signIn(authEmail, authPassword)
        if (error) {
          setAuthError(error)
          return
        }
        setShowSignInPrompt(false)
        openCreateModal()
        return
      }
      const { error, needsConfirmation } = await signUp(authEmail, authPassword)
      if (error) {
        setAuthError(error)
      } else if (needsConfirmation) {
        setAuthMessage('Check your email to confirm your account before signing in.')
      } else {
        setShowSignInPrompt(false)
        openCreateModal()
      }
    } finally {
      setAuthSubmitting(false)
    }
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
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[10px]"
          disabled={!hasUnsavedChanges || saving}
          onClick={handleSaveClick}
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

      <Dialog open={showSignInPrompt} onOpenChange={setShowSignInPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign in to save</DialogTitle>
            <DialogDescription>
              Create an account or sign in to save the {selectedTeam.city} {selectedTeam.name} cap table to your My Account page.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAuthSubmit} className="space-y-2">
            <div className="space-y-2">
              <Label htmlFor="cap-sheet-auth-email" className="text-xs">
                Email
              </Label>
              <Input
                id="cap-sheet-auth-email"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-sheet-auth-password" className="text-xs">
                Password
              </Label>
              <Input
                id="cap-sheet-auth-password"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="h-8 text-sm"
                required
              />
            </div>

            {authError && <p className="text-xs text-red-500">{authError}</p>}
            {authMessage && <p className="text-xs text-green-600">{authMessage}</p>}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSignInPrompt(false)}
                className="flex-1 h-8 text-sm"
                disabled={authSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-8 text-sm" disabled={authSubmitting}>
                {authSubmitting ? 'Please wait...' : authMode === 'signin' ? 'Sign in' : 'Sign up'}
              </Button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="text-xs text-muted-foreground underline"
              >
                {authMode === 'signin' ? 'Need an account?' : 'Have an account?'}
              </button>
              <button
                type="button"
                onClick={() => {
                  persistDraftForAuthRedirect(true)
                  signInWithGoogle()
                }}
                className="text-xs underline"
              >
                Sign in with Google
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
