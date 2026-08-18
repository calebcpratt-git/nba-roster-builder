import { Calendar } from 'association-gm-ui'

export function TradeDeadlinePicker() {
  return (
    <Calendar
      mode="single"
      selected={new Date(2027, 1, 6)}
      defaultMonth={new Date(2027, 1, 1)}
      className="rounded-md border"
    />
  )
}
