'use client'

import { useRoster } from '@/lib/roster-context'
import { SEASONS } from '@/lib/types'
import { formatCurrency, CAP_THRESHOLDS } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export function CapThresholdsLegend() {
  const { getTotalSalary } = useRoster()
  const currentSeason = SEASONS[0]
  const { total } = getTotalSalary(currentSeason)
  const thresholds = CAP_THRESHOLDS[currentSeason]

  const maxValue = thresholds[thresholds.length - 1].value * 1.1

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Cap Thresholds ({currentSeason})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {thresholds.map((threshold, index) => {
          const percentage = (threshold.value / maxValue) * 100
          const currentPercentage = (total / maxValue) * 100
          const isExceeded = total > threshold.value

          return (
            <div key={threshold.type} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      threshold.type === 'soft-cap'
                        ? "bg-muted-foreground"
                        : threshold.type === 'luxury-tax'
                        ? "bg-warning"
                        : threshold.type === 'first-apron'
                        ? "bg-chart-4"
                        : "bg-destructive"
                    )}
                  />
                  <span className="text-muted-foreground">{threshold.name}</span>
                </div>
                <span
                  className={cn(
                    "font-mono",
                    isExceeded
                      ? threshold.type === 'second-apron'
                        ? "text-destructive"
                        : threshold.type === 'first-apron'
                        ? "text-chart-4"
                        : "text-warning"
                      : "text-foreground"
                  )}
                >
                  {formatCurrency(threshold.value)}
                </span>
              </div>
              <div className="relative">
                <Progress
                  value={percentage}
                  className={cn(
                    "h-1.5",
                    threshold.type === 'soft-cap'
                      ? "[&>div]:bg-muted-foreground"
                      : threshold.type === 'luxury-tax'
                      ? "[&>div]:bg-warning"
                      : threshold.type === 'first-apron'
                      ? "[&>div]:bg-chart-4"
                      : "[&>div]:bg-destructive"
                  )}
                />
                {/* Current salary indicator */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-primary rounded-full"
                  style={{ left: `${Math.min(currentPercentage, 100)}%` }}
                />
              </div>
            </div>
          )
        })}

        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">Current Total</span>
            </div>
            <span className="font-mono text-primary font-medium">{formatCurrency(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
