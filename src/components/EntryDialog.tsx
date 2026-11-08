import { useEffect, useRef } from 'react'

interface EntryDialogProps {
  onWalkthrough: () => void
  onFullAccess: () => void
}

export function EntryDialog({ onWalkthrough, onFullAccess }: EntryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog ref={dialogRef} className="info-modal entry-dialog" aria-labelledby="entry-title" aria-describedby="entry-description" onCancel={(event) => event.preventDefault()}>
      <span className="eyebrow">WELCOME TO THE LAB</span>
      <h2 id="entry-title">How would you like to explore?</h2>
      <p id="entry-description">Build up the laboratory one module at a time, or open the complete simulator immediately.</p>
      <div className="entry-choices">
        <button type="button" onClick={onWalkthrough}>
          <span className="eyebrow">GUIDED EXPLORATION</span>
          <strong>Walkthrough mode</strong>
          <span>Start with the particles. Try a short task to unlock each new module.</span>
          <b>START WALKTHROUGH</b>
        </button>
        <button type="button" onClick={onFullAccess}>
          <span className="eyebrow">EXPLORE FREELY</span>
          <strong>Full access</strong>
          <span>Open every view and control, ready for your own experiments.</span>
          <b>ENTER SIMULATOR</b>
        </button>
      </div>
    </dialog>
  )
}
