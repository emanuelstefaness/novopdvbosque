import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

/** Popover "..." com uma lista de ações para um item de pedido (mesmas ações que já existiam soltas na tela, só agrupadas). */
export default function ItemActionsMenu({ actions, label = 'Mais ações do item' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="item-actions-menu" ref={ref}>
      <button
        type="button"
        className="item-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="menu" size={16} />
      </button>
      {open && (
        <div className="item-actions-panel" role="menu">
          {actions.filter(Boolean).map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`item-actions-item ${a.danger ? 'item-actions-danger' : ''}`}
              disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick() }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
