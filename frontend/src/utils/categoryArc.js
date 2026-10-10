/**
 * Geometria da "meia-lua" de categorias do delivery.
 *
 * Os botões ficam sobre meia elipse e são distribuídos com o MESMO comprimento de curva entre
 * vizinhos (e não com o mesmo ângulo nem o mesmo X), para não encostarem nas pontas nem
 * ficarem afastados no topo.
 *
 * Posição: x em % da largura da meia-lua; y em px a partir do topo do contêiner.
 */
export const ARC = {
  /** raio horizontal, em % da largura da meia-lua */
  radiusXPercent: 41,
  /** topo (px) do botão no ponto mais alto */
  top: 16,
  /** profundidade da curva (px) entre o ponto mais alto e as pontas */
  depth: 104,
  /** largura de referência (px) usada para medir o comprimento da curva (celular pequeno) */
  referenceWidth: 340,
}

/** Ângulos (de π, esquerda, a 0, direita) com igual comprimento de curva entre vizinhos. */
export function arcAngles(total) {
  if (total <= 1) return [Math.PI / 2]
  const rx = (ARC.radiusXPercent / 100) * ARC.referenceWidth
  const ry = ARC.depth
  const steps = 720
  const theta = (i) => Math.PI * (1 - i / steps)
  const length = [0]
  for (let i = 1; i <= steps; i++) {
    const a = theta(i - 1)
    const b = theta(i)
    const dx = rx * (Math.cos(b) - Math.cos(a))
    const dy = ry * (Math.sin(b) - Math.sin(a))
    length.push(length[i - 1] + Math.hypot(dx, dy))
  }
  const whole = length[steps]
  const out = []
  let cursor = 0
  for (let k = 0; k < total; k++) {
    const target = (k / (total - 1)) * whole
    while (cursor < steps && length[cursor + 1] < target) cursor++
    const span = length[Math.min(cursor + 1, steps)] - length[cursor] || 1
    const frac = Math.min(1, Math.max(0, (target - length[cursor]) / span))
    out.push(theta(cursor + frac))
  }
  return out
}

export function categoryArcStyle(index, total) {
  const angle = arcAngles(total)[index] ?? Math.PI / 2
  return {
    '--arc-x': `${(50 + Math.cos(angle) * ARC.radiusXPercent).toFixed(2)}%`,
    '--arc-y': `${(ARC.top + (1 - Math.sin(angle)) * ARC.depth).toFixed(1)}px`,
  }
}

/** Posição numérica (px) para uma largura de meia-lua; usada nos testes. */
export function categoryArcPoint(index, total, widthPx) {
  const s = categoryArcStyle(index, total)
  return { x: (parseFloat(s['--arc-x']) / 100) * widthPx, y: parseFloat(s['--arc-y']) }
}

/**
 * Lado onde o rótulo fica: nas pontas (curva quase vertical) o rótulo vai ao lado do ícone,
 * pelo lado de dentro da curva, para não bater no vizinho de baixo.
 */
export function categoryArcSide(index, total) {
  const angle = arcAngles(total)[index] ?? Math.PI / 2
  const c = Math.cos(angle)
  if (c > 0.86) return 'right'
  if (c < -0.86) return 'left'
  return 'center'
}
