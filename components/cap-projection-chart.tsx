'use client'

import { useRoster } from '@/lib/roster-context'
import { SEASONS, Season } from '@/lib/types'
import { CAP_THRESHOLDS, formatCurrency, formatCurrencyFull } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
            {selectedTeam.city} {selectedTeam.name} - Cap Projection
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-chart-2" />
              <span className="text-muted-foreground">Saved Contracts</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative mt-4">
          {/* Chart area */}
          <div className="flex items-end gap-2" style={{ height: '280px' }}>
            {projections.map((proj) => {
              const totalHeight = (proj.total / maxSalary) * 100
              const currentHeight = (proj.current / maxSalary) * 100
              const savedHeight = (proj.saved / maxSalary) * 100
              const softCapLine = (proj.softCap / maxSalary) * 100
              const taxLine = (proj.luxuryTax / maxSalary) * 100
              const apron1Line = (proj.firstApron / maxSalary) * 100
              const apron2Line = (proj.secondApron / maxSalary) * 100

              const hasViolation = proj.violations.length > 0
              const worstViolation = proj.violations[proj.violations.length - 1]

              return (
                <div key={proj.season} className="relative flex-1 group">
                  {/* Threshold lines */}
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/30"
                    style={{ bottom: `${softCapLine}%` }}
                  />
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-warning/50"
                    style={{ bottom: `${taxLine}%` }}
                  />
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-chart-4/50"
                    style={{ bottom: `${apron1Line}%` }}
                  />
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-destructive/50"
                    style={{ bottom: `${apron2Line}%` }}
                  />

                  {/* Bars */}
                  <div className="absolute bottom-0 left-1 right-1 flex flex-col items-stretch">
                    {/* Saved contracts portion */}
                    {proj.saved > 0 && (
                      <div
                        className="w-full rounded-t bg-chart-2 transition-all group-hover:opacity-80"
                        style={{ height: `${(savedHeight / totalHeight) * (totalHeight / 100) * 280}px` }}
                      />
                    )}
                    {/* Current contracts portion */}
                    <div
                      className={cn(
                        "w-full transition-all group-hover:opacity-80",
                        proj.saved > 0 ? "" : "rounded-t",
                        hasViolation ? "bg-primary" : "bg-primary"
                      )}
                      style={{ height: `${(currentHeight / 100) * 280}px` }}
                    />
                  </div>

                  {/* Violation indicator */}
                  {hasViolation && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 whitespace-nowrap",
                          worstViolation?.type === 'second-apron'
                            ? "border-destructive text-destructive"
                            : worstViolation?.type === 'first-apron'
                            ? "border-chart-4 text-chart-4"
                            : "border-warning text-warning"
                        )}
                      >
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        {worstViolation?.type === 'second-apron'
                          ? '2nd Apron'
                          : worstViolation?.type === 'first-apron'
                          ? '1st Apron'
                          : worstViolation?.type === 'luxury-tax'
                          ? 'Tax'
                          : 'Over Cap'}
                      </Badge>
                    </div>
                  )}

                  {/* Hover tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 hidden group-hover:block z-10">
                    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg min-w-[180px]">
                      <p className="text-xs font-medium mb-2">{proj.season}</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total:</span>
                          <span className="font-mono">{formatCurrencyFull(proj.total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current:</span>
                          <span className="font-mono">{formatCurrencyFull(proj.current)}</span>
                        </div>
                        {proj.saved > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Saved:</span>
                            <span className="font-mono text-chart-2">{formatCurrencyFull(proj.saved)}</span>
                          </div>
                        )}
                        <div className="border-t border-border mt-2 pt-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cap Space:</span>
                            <span className={cn("font-mono", proj.total > proj.softCap ? "text-destructive" : "text-primary")}>
                              {formatCurrencyFull(proj.softCap - proj.total)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Season label */}
                  <div className="absolute -bottom-6 left-0 right-0 text-center">
                    <span className="text-xs text-muted-foreground">{proj.season.split('-')[0]}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 -ml-16 flex flex-col justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(maxSalary)}</span>
            <span>{formatCurrency(maxSalary * 0.75)}</span>
            <span>{formatCurrency(maxSalary * 0.5)}</span>
            <span>{formatCurrency(maxSalary * 0.25)}</span>
            <span>$0</span>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-6 mt-10 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 border-t border-dashed border-muted-foreground/30" />
              <span>Salary Cap</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 border-t border-dashed border-warning/50" />
              <span>Luxury Tax</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 border-t border-dashed border-chart-4/50" />
              <span>1st Apron</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 border-t border-dashed border-destructive/50" />
              <span>2nd Apron</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
