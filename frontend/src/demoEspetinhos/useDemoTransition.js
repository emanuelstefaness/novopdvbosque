import { flushSync } from 'react-dom'

export function runDemoTransition(update) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || !document.startViewTransition) {
    update()
    return Promise.resolve()
  }
  return document.startViewTransition(() => flushSync(update)).finished.catch(() => undefined)
}
