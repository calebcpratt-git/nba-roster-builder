'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useRoster } from '@/lib/roster-context'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function AuthPanel() {
  const { user, signIn, signUp, signInWithGoogle, signOut, loading } = useAuth()
  const { persistDraftForAuthRedirect } = useRoster()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  if (loading) return null

  if (user) {
    return (
      <div className="flex items-center gap-4 text-[12.5px] font-semibold">
        <Link href="/account" className="text-white underline underline-offset-2">
          My Account
        </Link>
        <button onClick={() => signOut()} className="text-white/75 underline underline-offset-2">
          Sign out
        </button>
      </div>
    )
  }

  const openWithMode = (m: 'signin' | 'signup') => {
    setError(null)
    setMessage(null)
    setMode(m)
    setIsOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      if (error) setError(error)
      else setIsOpen(false)
      return
    }
    const { error, needsConfirmation } = await signUp(email, password)
    if (error) {
      setError(error)
    } else if (needsConfirmation) {
      setMessage('Check your email to confirm your account before signing in.')
    } else {
      setIsOpen(false)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2">
        <PopoverTrigger asChild>
          <button
            onClick={() => openWithMode('signin')}
            className="text-white/85 hover:text-white font-semibold text-[12.5px] px-2 py-2"
          >
            Sign In
          </button>
        </PopoverTrigger>
        <PopoverTrigger asChild>
          <button
            onClick={() => openWithMode('signup')}
            className="bg-white/10 hover:bg-white/15 border border-white/25 text-white font-semibold text-[12.5px] px-3.5 py-2 rounded-lg transition-colors"
          >
            Create Account
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" className="w-72">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {mode === 'signin' ? 'Sign in' : 'Create an account'}
          </p>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          {message && <p className="text-xs text-success">{message}</p>}
          <Button type="submit" size="sm" className="w-full">
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => {
                persistDraftForAuthRedirect(false)
                signInWithGoogle()
              }}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Sign in with Google
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
