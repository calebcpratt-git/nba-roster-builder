'use client'

import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import { formatCurrency, formatCurrencyFull, CAP_THRESHOLDS } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function CapSummaryCards() {
  const { getTotalSalary, selectedSeason } = useRoster()

  const summaries = SEASONS.map((season) => {
    const { current, saved, total } = getTotalSalary(season)
    const thresholds = CAP_THRESHOLDS[season]
    const softCap = thresholds.find((t) => t.type === 'soft-cap')?.value || 0
    const luxuryTax = thresholds.find((t) => t.type === 'luxury-tax')?.value || 0
    const firstApron = thresholds.find((t) => t.type === 'first-apron')?.value || 0
    const secondApron = thresholds.find((t) => t.type === 'second-apron')?.value || 0

    const capSpace = softCap - total
    const violations = thresholds.filter((t) => total > t.value)
    const worstViolation = violations[violations.length - 1]

    return {
      season,
      total,
      current,
      saved,
      capSpace,
      softCap,
      luxuryTax,
      firstApron,
      secondApron,
      violations,
      worstViolation,
      taxBill: total > luxuryTax ? (total - luxuryTax) * 2.5 : 0, // Simplified tax calculation
    }
  })

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Season Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {summaries.map((summary) => {
            const isOverCap = summary.total > summary.softCap
            const isOverTax = summary.total > summary.luxuryTax
            const isOverApron1 = summary.total > summary.firstApron
            const isOverApron2 = summary.total > summary.secondApron

            return (
              <div
                key={summary.season}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  isOverApron2
                    ? "border-destructive/50 bg-destructive/5"
                    : isOverApron1
                    ? "border-chart-4/50 bg-chart-4/5"
                    : isOverTax
                    ? "border-warning/50 bg-warning/5"
                    : "border-border bg-muted/20"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {summary.season.split('-')[0]}
                  </span>
                  {summary.worstViolation && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1 py-0",
                        summary.worstViolation.type === 'second-apron'
                          ? "border-destructive text-destructive"
                          : summary.worstViolation.type === 'first-apron'
                          ? "border-chart-4 text-chart-4"
                          : summary.worstViolation.type === 'luxury-tax'
                          ? "border-warning text-warning"
                          : "border-muted-foreground text-muted-foreground"
                      )}
                    >
                      {summary.worstViolation.type === 'second-apron'
                        ? '2nd Apron'
                        : summary.worstViolation.type === 'first-apron'
                        ? '1st Apron'
                        : summary.worstViolation.type === 'luxury-tax'
                        ? 'Tax'
                        : 'Over Cap'}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold font-mono">
                    {formatCurrency(summary.total)}
                  </p>
                  <p
                    className={cn(
                      "text-xs font-mono",
                      summary.capSpace >= 0 ? "text-primary" : "text-destructive"
                    )}
                  >
                    {summary.capSpace >= 0 ? '+' : ''}{formatCurrency(summary.capSpace)} cap
                  </p>
                  {summary.saved > 0 && (
                    <p className="text-[10px] text-chart-2">
                      +{formatCurrency(summary.saved)} saved
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
