import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
} from 'association-gm-ui'

export function ReleasePlayerConfirm() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="outline">Release Player</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release from roster?</DialogTitle>
          <DialogDescription>
            This clears the roster spot and adds the remaining guaranteed
            salary to the team&apos;s dead cap. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant="destructive">Release Player</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
