import { Tooltip, TooltipTrigger, TooltipContent, Badge } from 'association-gm-ui'

export function OnBadge() {
  return (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Badge variant="outline">Bird Rights</Badge>
      </TooltipTrigger>
      <TooltipContent>
        Full Bird rights — re-signable up to the max
      </TooltipContent>
    </Tooltip>
  )
}
