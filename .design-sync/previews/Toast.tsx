import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
} from 'association-gm-ui'

export function TradeAccepted() {
  return (
    <ToastProvider>
      <div className="relative h-40 w-96">
        <Toast className="static translate-x-0">
          <div className="grid gap-1">
            <ToastTitle>Trade accepted</ToastTitle>
            <ToastDescription>
              The other GM approved your offer. Review the final cap impact.
            </ToastDescription>
          </div>
          <ToastAction altText="View trade">View</ToastAction>
          <ToastClose />
        </Toast>
      </div>
      <ToastViewport className="static" />
    </ToastProvider>
  )
}
