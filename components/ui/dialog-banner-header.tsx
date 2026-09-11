'use client'

import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { DialogClose } from '@/components/ui/dialog'

export function DialogBannerHeader({
  icon: Icon,
  title,
  subtitle,
  colors,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  colors?: { primary: string; secondary: string }
}) {
  return (
    <div
      className={colors ? 'px-5 py-4 flex items-start justify-between gap-3' : 'bg-primary px-5 py-4 flex items-start justify-between gap-3'}
      style={colors ? { background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` } : undefined}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
          <Icon className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="min-w-0">
          <h2
            className="text-white font-semibold text-base leading-tight truncate"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
          >
            {title}
          </h2>
          <p className="text-white/80 text-xs mt-0.5">{subtitle}</p>
        </div>
      </div>
      <DialogClose className="text-white/80 hover:text-white transition-colors shrink-0 mt-0.5">
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </div>
  )
}
