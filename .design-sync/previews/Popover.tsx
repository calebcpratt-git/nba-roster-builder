import { Popover, PopoverTrigger, PopoverContent, Button } from 'association-gm-ui'

export function CapSummary() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">Cap Summary</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">2026-27 Team Salary</h4>
          <p className="text-sm text-muted-foreground">
            $178.4M committed, $3.2M below the first apron. Two open roster
            spots remain.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
