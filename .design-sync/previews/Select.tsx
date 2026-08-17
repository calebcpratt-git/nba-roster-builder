import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'association-gm-ui'

export function PositionPicker() {
  return (
    <Select defaultValue="sf" defaultOpen>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Position" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Position</SelectLabel>
          <SelectItem value="pg">Point Guard</SelectItem>
          <SelectItem value="sg">Shooting Guard</SelectItem>
          <SelectItem value="sf">Small Forward</SelectItem>
          <SelectItem value="pf">Power Forward</SelectItem>
          <SelectItem value="c">Center</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
