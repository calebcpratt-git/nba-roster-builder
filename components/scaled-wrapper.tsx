'use client'

import { useRef, useState, useLayoutEffect, ReactNode } from 'react'

interface ScaledWrapperProps {
  scale: number
  children: ReactNode
}

export function ScaledWrapper({ scale, children }: ScaledWrapperProps) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    if (innerRef.current) {
      const updateDimensions = () => {
        const rect = innerRef.current?.getBoundingClientRect()
        if (rect) {
          setDimensions({ width: rect.width, height: rect.height })
        }
      }
      
      updateDimensions()
      
      const resizeObserver = new ResizeObserver(updateDimensions)
      resizeObserver.observe(innerRef.current)
      
      return () => resizeObserver.disconnect()
    }
  }, [scale])

  return (
    <div 
      style={{ 
        width: dimensions?.width ?? 'auto', 
        height: dimensions?.height ?? 'auto',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div 
        ref={innerRef}
        className="origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
