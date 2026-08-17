import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  Button,
} from 'association-gm-ui'

export function TradeBuilder() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Open Trade Builder</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Build a Trade</SheetTitle>
          <SheetDescription>
            Add players and picks from both sides, then check salary
            matching against the current cap rules.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="secondary">Cancel</Button>
          </SheetClose>
          <Button>Validate Trade</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
