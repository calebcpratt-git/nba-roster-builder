import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Button,
} from 'association-gm-ui'

export function ConfirmTrade() {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button>Submit Trade</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm this trade?</AlertDialogTitle>
          <AlertDialogDescription>
            Both rosters will update immediately and this cannot be undone
            from the cap sheet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Confirm Trade</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
