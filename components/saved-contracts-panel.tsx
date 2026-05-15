'use client'

import { useState } from 'react'
import { useRoster } from '@/lib/roster-context'
import { formatCurrency, formatCurrencyFull } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, FileText, ArrowLeftRight, UserPlus, RotateCcw, Trash2 } from 'lucide-react'

export function SavedContractsPanel() {
  const { savedContracts, removeSavedContract, setDeletedContractIds, deletedContractIds } = useRoster()
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null)

  const totalValue = savedContracts.reduce((sum, contract) => {
    return sum + Object.values(contract.salary).reduce((a, b) => a + b, 0)
  }, 0)

  if (savedContracts.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Saved Contracts</CardTitle>
            <Badge variant="secondary" className="text-xs">0 contracts</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">No saved contracts yet</p>
            <p className="text-xs text-muted-foreground/70 max-w-[200px]">
              Create extensions, sign free agents, or build trades to add contracts here
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Saved Contracts</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {savedContracts.length} contract{savedContracts.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {savedContracts.map((contract) => {
            const years = Object.keys(contract.salary).length
            const totalSalary = Object.values(contract.salary).reduce((a, b) => a + b, 0)
            const avgSalary = totalSalary / years

            return (
            <div
              key={contract.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-opacity ${
                deletedContractIds.has(contract.id)
                  ? 'bg-muted/20 border-muted/20 opacity-50'
                  : 'bg-chart-2/5 border-chart-2/20'
              }`}
            >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      contract.type === 'extension'
                        ? 'bg-primary/20'
                        : contract.type === 'trade'
                        ? 'bg-chart-4/20'
                        : 'bg-chart-2/20'
                    }`}
                  >
                    {contract.type === 'extension' ? (
                      <FileText className="h-4 w-4 text-primary" />
                    ) : contract.type === 'trade' ? (
                      <ArrowLeftRight className="h-4 w-4 text-chart-4" />
                    ) : (
                      <UserPlus className="h-4 w-4 text-chart-2" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{contract.playerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {years}yr / {formatCurrency(totalSalary)} ({formatCurrency(avgSalary)}/yr)
                    </p>
                  </div>
                </div>
                {deletingContractId === contract.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      onClick={() => {
                        // Undo: remove from deleted set
                        const newDeleted = new Set(deletedContractIds)
                        newDeleted.delete(contract.id)
                        setDeletedContractIds(newDeleted)
                        setDeletingContractId(null)
                      }}
                      title="Undo"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        removeSavedContract(contract.id)
                        setDeletingContractId(null)
                      }}
                      title="Delete permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      // Mark as deleted in the set
                      const newDeleted = new Set(deletedContractIds)
                      newDeleted.add(contract.id)
                      setDeletedContractIds(newDeleted)
                      setDeletingContractId(contract.id)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Added Value</span>
            <span className="font-mono font-medium text-chart-2">{formatCurrency(totalValue)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
