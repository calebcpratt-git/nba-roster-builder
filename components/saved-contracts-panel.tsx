'use client'

import { useState, useEffect, useRef } from 'react'
import { useRoster } from '@/lib/roster-context'
import { SavedContract } from '@/lib/types'
import { formatCurrency, formatCurrencyFull } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, FileText, ArrowLeftRight, UserPlus, RotateCcw, Trash2, ChevronRight } from 'lucide-react'
import { EditContractModal } from './edit-contract-modal'

export function SavedContractsPanel() {
  const { savedContracts, removeSavedContract, updateSavedContract, setDeletedContractIds, deletedContractIds } = useRoster()
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null)
  const [editingContract, setEditingContract] = useState<SavedContract | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const prevContractCountRef = useRef(savedContracts.length)

  useEffect(() => {
    if (prevContractCountRef.current === 0 && savedContracts.length > 0) {
      setIsCollapsed(false)
    }
    prevContractCountRef.current = savedContracts.length
  }, [savedContracts.length])

  if (savedContracts.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Saved Contracts</CardTitle>
            <Badge variant="secondary" className="text-xs">0 contracts</Badge>
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
    <div
      onClick={() => setIsCollapsed(!isCollapsed)}
      className="cursor-pointer rounded-lg"
    >
    <Card className="bg-card border-border hover:bg-accent transition-colors">
      <CardHeader className="pb-3 select-none">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Saved Contracts</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {savedContracts.length} contract{savedContracts.length !== 1 ? 's' : ''}
            </Badge>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                isCollapsed ? 'rotate-0' : 'rotate-90'
              }`}
            />
          </div>
        </div>
      </CardHeader>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="overflow-hidden">
      <CardContent>
        <div className="space-y-2">
          {savedContracts.map((contract) => {
            const years = Object.keys(contract.salary).length
            const totalSalary = Object.values(contract.salary).reduce((a, b) => a + b, 0)
            const avgSalary = totalSalary / years

            return (
            <div
              key={contract.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-opacity cursor-pointer ${
                deletedContractIds.has(contract.id)
                  ? 'bg-muted/20 border-muted/20 opacity-50'
                  : 'bg-chart-2/5 border-chart-2/20 hover:bg-chart-2/10'
              }`}
              onClick={() => setEditingContract(contract)}
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
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                    onClick={(e) => {
                      e.stopPropagation()
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
      </CardContent>
      </div>
      </div>
    </Card>
    </div>

    <EditContractModal
      contract={editingContract}
      isOpen={editingContract !== null}
      onClose={() => setEditingContract(null)}
      onSave={(updated) => {
        updateSavedContract(updated)
        setEditingContract(null)
      }}
    />
  </>
  )
}
