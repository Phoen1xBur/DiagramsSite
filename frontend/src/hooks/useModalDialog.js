import { useEffect, useRef } from 'react'

/**
 * Keeps a native <dialog> in sync with a controlled `isOpen` flag.
 * Escape and a click on the dialog element (the dimmed backdrop area) close it,
 * unless `closeDisabled` is true. Focus is returned to the opener.
 */
export function useModalDialog({ isOpen, onClose, closeDisabled = false, onCancel = null }) {
  const dialogRef = useRef(null)
  const openerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  const onCancelRef = useRef(onCancel)
  const isOpenRef = useRef(isOpen)

  onCloseRef.current = onClose
  closeDisabledRef.current = closeDisabled
  onCancelRef.current = onCancel
  isOpenRef.current = isOpen

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return undefined

    const restoreFocus = () => {
      const opener = openerRef.current
      openerRef.current = null
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus()
      }
    }

    const handleCancel = (event) => {
      if (onCancelRef.current) {
        onCancelRef.current(event)
        if (event.defaultPrevented) return
      }
      if (closeDisabledRef.current) event.preventDefault()
    }

    const handleClose = () => {
      restoreFocus()
      if (isOpenRef.current) onCloseRef.current?.()
    }

    const handleClick = (event) => {
      if (event.target === el && !closeDisabledRef.current) {
        el.close()
      }
    }

    el.addEventListener('cancel', handleCancel)
    el.addEventListener('close', handleClose)
    el.addEventListener('click', handleClick)

    if (isOpen) {
      if (!el.open) {
        openerRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
        el.showModal()
      }
    } else if (el.open) {
      el.close()
    }

    return () => {
      el.removeEventListener('cancel', handleCancel)
      el.removeEventListener('close', handleClose)
      el.removeEventListener('click', handleClick)
    }
  }, [isOpen])

  return dialogRef
}
