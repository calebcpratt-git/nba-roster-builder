import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from 'association-gm-ui'

export function PlayerCapCard() {
  return (
    <Card className="w-[360px]">
      <CardHeader className="border-b">
        <CardTitle>Jaylen Brown</CardTitle>
        <CardDescription>
          Boston Celtics · SF/SG · Bird rights
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">4 yrs left</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          2026-27 cap hit is $49.2M, part of a supermax extension signed in
          2023. No trade kicker; Bird rights allow re-signing over the cap.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" variant="outline">
          View Contract
        </Button>
        <Button size="sm">Explore Trades</Button>
      </CardFooter>
    </Card>
  )
}
