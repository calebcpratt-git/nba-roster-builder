'use client'

import { cn } from '@/lib/utils'

interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedControlOption<T>[]
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-lg bg-muted p-1', className)}>
      {options.map((opt) => {
        const isSelected = opt.value === value
        const isDisabled = disabled || opt.disabled
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !isDisabled && onChange(opt.value)}
            disabled={isDisabled}
            className={cn(
              'flex-1 min-w-[64px] rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground/70 hover:text-foreground',
              isDisabled && 'cursor-not-allowed opacity-50 hover:text-foreground/70',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
