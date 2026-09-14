/** Alarme repetido até `stopCaixaOnlineOrderAlarm()` (frente de caixa — novo pedido online). */
let intervalId = null

function playBeepPair() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime
    const mk = (freq, start, end) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.2, start)
      gain.gain.exponentialRampToValueAtTime(0.01, end)
      osc.start(start)
      osc.stop(end)
    }
    mk(880, t0, t0 + 0.2)
    mk(660, t0 + 0.28, t0 + 0.48)
    window.setTimeout(() => {
      try {
        ctx.close()
      } catch { /* Recurso opcional de áudio/vibração indisponível. */ }
    }, 700)
  } catch { /* Recurso opcional de áudio/vibração indisponível. */ }
}

export function startCaixaOnlineOrderAlarm() {
  stopCaixaOnlineOrderAlarm()
  playBeepPair()
  intervalId = window.setInterval(() => playBeepPair(), 2400)
}

export function stopCaixaOnlineOrderAlarm() {
  if (intervalId != null) {
    clearInterval(intervalId)
    intervalId = null
  }
}
