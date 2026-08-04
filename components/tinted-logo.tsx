'use client'

import { useId } from 'react'
import Image from 'next/image'
import { getLogoTintMatrix } from '@/lib/team-theme'

export function TintedLogo({
  color,
  size,
  className,
}: {
  color: string
  size: number
  className?: string
}) {
  const filterId = useId()

  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={getLogoTintMatrix(color)} />
        </filter>
      </svg>
      <Image
        src="/logo.png"
        alt="Association GM"
        width={size}
        height={size}
        className={className}
        style={{
          filter: `url(#${filterId}) drop-shadow(0 2px 6px rgba(0,0,0,0.3))`,
        }}
      />
    </>
  )
}
