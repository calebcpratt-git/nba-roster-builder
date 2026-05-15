'use client'

import { useRef, useState, useEffect, ReactNode } from 'react'

interface ScaledWrapperProps {
  scale: number
  children: ReactNode
  className?: string
}

export function ScaledWrapper({ scale, children, className }: ScaledWrapperProps) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (innerRef.current) {
      const updateDimensions = () => {
        const rect = innerRef.current?.getBoundingClientRect()
        if (rect) {
          // The getBoundingClientRect already returns the scaled dimensions
          setDimensions({ width: rect.width, height: rect.height })
        }
      }
      
      updateDimensions()
      
      // Use ResizeObserver to handle dynamic content changes
      const resizeObserver = new ResizeObserver(updateDimensions)
      resizeObserver.observe(innerRef.current)
      
      return () => resizeObserver.disconnect()
    }
  }, [scale])

  return (
    <div 
      className={className}
      style={{ 
        width: dimensions.width || 'auto', 
        height: dimensions.height || 'auto',
        flexShrink: 0,
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
