'use client'

import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import { CAP_THRESHOLDS, formatCurrency, formatCurrencyFull } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CapProjectionChart() {
  const { getTotalSalary, selectedTeam } = useRoster()

  const projections = SEASONS.map((season) => {
    const { current, saved, total } = getTotalSalary(season)
    const thresholds = CAP_THRESHOLDS[season]
    const violations = thresholds.filter((t) => total > t.value)
    
    return {
      season,
      current,
      saved,
      total,
      thresholds,
      violations,
      softCap: thresholds.find((t) => t.type === 'soft-cap')?.value || 0,
      luxuryTax: thresholds.find((t) => t.type === 'luxury-tax')?.value || 0,
      firstApron: thresholds.find((t) => t.type === 'first-apron')?.value || 0,
      secondApron: thresholds.find((t) => t.type === 'second-apron')?.value || 0,
    }
  })

  const maxSalary = Math.max(
    ...projections.map((p) => p.total),
    ...projections.map((p) => p.secondApron)
  ) * 1.1

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            Cap Projection
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
              <span className="text-muted-foreground">Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-chart-2" />
              <span className="text-muted-foreground">Saved Contracts</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative mt-4 ml-16">
          {/* Chart area */}
          <div className="flex items-end gap-3" style={{ height: '280px' }}>
            {projections.map((proj) => {
              const currentHeight = (proj.current / maxSalary) * 100
              const savedHeight = (proj.saved / maxSalary) * 100
              const softCapLine = (proj.softCap / maxSalary) * 100
              const taxLine = (proj.luxuryTax / maxSalary) * 100
              const apron1Line = (proj.firstApron / maxSalary) * 100
              const apron2Line = (proj.secondApron / maxSalary) * 100

              const hasViolation = proj.violations.length > 0
              const worstViolation = proj.violations[proj.violations.length - 1]

              return (
                <div key={proj.season} className="relative flex-1 group h-full">
                  {/* Threshold markers on the bar */}
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ bottom: `${softCapLine}%` }}
                  >
                    <div className="h-0.5 bg-muted-foreground/60 rounded-full" />
                  </div>
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ bottom: `${taxLine}%` }}
                  >
                    <div className="h-0.5 bg-warning rounded-full" />
                  </div>
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ bottom: `${apron1Line}%` }}
                  >
                    <div className="h-0.5 bg-orange-500 rounded-full" />
                  </div>
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ bottom: `${apron2Line}%` }}
                  >
                    <div className="h-0.5 bg-destructive rounded-full" />
                  </div>

                  {/* Stacked bars */}
                  <div className="absolute bottom-0 left-0 right-0 flex flex-col">
                    {/* Saved contracts portion (on top) */}
                    {proj.saved > 0 && (
                      <div
                        className="w-full bg-chart-2 rounded-t transition-all group-hover:brightness-110"
                        style={{ height: `${savedHeight * 2.8}px` }}
                      />
                    )}
                    {/* Current contracts portion */}
                    <div
                      className={cn(
                        "w-full bg-primary transition-all group-hover:brightness-110",
                        proj.saved === 0 && "rounded-t"
                      )}
                      style={{ height: `${currentHeight * 2.8}px` }}
                    />
                  </div>

                  {/* Violation indicator */}
                  {hasViolation && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 whitespace-nowrap border",
                          worstViolation?.type === 'second-apron'
                            ? "border-destructive text-destructive bg-destructive/10"
                            : worstViolation?.type === 'first-apron'
                            ? "border-orange-500 text-orange-500 bg-orange-500/10"
                            : "border-warning text-warning bg-warning/10"
                        )}
                      >
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        {worstViolation?.type === 'second-apron'
                          ? '2nd'
                          : worstViolation?.type === 'first-apron'
                          ? '1st'
                          : worstViolation?.type === 'luxury-tax'
                          ? 'Tax'
                          : 'Cap'}
                      </Badge>
                    </div>
                  )}

                  {/* Hover tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-10 hidden group-hover:block z-30">
                    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[200px]">
                      <p className="text-sm font-semibold mb-2">{proj.season}</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Salary:</span>
                          <span className="font-mono font-medium">{formatCurrencyFull(proj.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Roster:</span>
                          <span className="font-mono">{formatCurrencyFull(proj.current)}</span>
                        </div>
                        {proj.saved > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Saved Contracts:</span>
                            <span className="font-mono text-chart-2">{formatCurrencyFull(proj.saved)}</span>
                          </div>
                        )}
                        <div className="border-t border-border mt-2 pt-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Salary Cap:</span>
                            <span className="font-mono">{formatCurrencyFull(proj.softCap)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cap Space:</span>
                            <span className={cn(
                              "font-mono font-medium",
                              proj.total > proj.softCap ? "text-destructive" : "text-emerald-500"
                            )}>
                              {proj.total > proj.softCap ? '-' : '+'}{formatCurrencyFull(Math.abs(proj.softCap - proj.total))}
                            </span>
                          </div>
                        </div>
                        {proj.violations.length > 0 && (
                          <div className="border-t border-border mt-2 pt-2">
                            <p className="text-muted-foreground mb-1">Thresholds Exceeded:</p>
                            {proj.violations.map((v) => (
                              <div key={v.type} className="flex justify-between text-destructive">
                                <span>{v.label}:</span>
                                <span className="font-mono">+{formatCurrencyFull(proj.total - v.value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Season label */}
                  <div className="absolute -bottom-7 left-0 right-0 text-center">
                    <span className="text-xs text-muted-foreground font-medium">
                      {proj.season.split('-')[0].slice(-2)}-{proj.season.split('-')[1]}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 -ml-16 w-14 flex flex-col justify-between text-xs text-muted-foreground text-right pr-2">
            <span>{formatCurrency(maxSalary)}</span>
            <span>{formatCurrency(maxSalary * 0.75)}</span>
            <span>{formatCurrency(maxSalary * 0.5)}</span>
            <span>{formatCurrency(maxSalary * 0.25)}</span>
            <span>$0</span>
          </div>

          {/* Threshold Legend */}
          <div className="flex items-center justify-center gap-6 mt-10 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-muted-foreground/60 rounded-full" />
              <span>Salary Cap</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-warning rounded-full" />
              <span>Luxury Tax</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-orange-500 rounded-full" />
              <span>1st Apron</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-destructive rounded-full" />
              <span>2nd Apron</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
