'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useRoster } from '@/lib/roster-context'

export function AuthPanel() {
  const { user, signIn, signUp, signInWithGoogle, signOut, loading } = useAuth()
  const { persistDraftForAuthRedirect } = useRoster()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (loading) return null

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link href="/account" className="underline font-medium">
          My Account
        </Link>
        <button onClick={() => signOut()} className="underline">
          Sign out
        </button>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      if (error) setError(error)
      return
    }
    const { error, needsConfirmation } = await signUp(email, password)
    if (error) {
      setError(error)
    } else if (needsConfirmation) {
      setMessage('Check your email to confirm your account before signing in.')
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 text-sm">
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded px-2 py-1"
          required
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded px-2 py-1"
          required
        />
        <button type="submit" className="underline">
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-muted-foreground"
        >
          {mode === 'signin' ? 'need an account?' : 'have an account?'}
        </button>
        {error && <span className="text-red-500">{error}</span>}
        {message && <span className="text-green-600">{message}</span>}
      </form>
      <button
        type="button"
        onClick={() => {
          persistDraftForAuthRedirect(false)
          signInWithGoogle()
        }}
        className="underline"
      >
        Sign in with Google
      </button>
    </div>
  )
}
