import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorComanda,
  autoriaDaComanda,
  autorDoItem,
  formatarDecorrido,
  prioridadeDaComanda,
  rotuloDaMesa,
} from '../src/utils/producao.js'

const sql = (minAtras, agora) => {
  const d = new Date(agora - minAtras * 60000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const AGORA = Date.now()

test('prioridade: normal < 10 min, atenção 10–19, atrasado a partir de 20', () => {
  assert.equal(prioridadeDaComanda([{ created_at: sql(3, AGORA) }], AGORA).nivel, 'normal')
  assert.equal(prioridadeDaComanda([{ created_at: sql(12, AGORA) }], AGORA).nivel, 'atencao')
  assert.equal(prioridadeDaComanda([{ created_at: sql(25, AGORA) }], AGORA).nivel, 'atrasado')
})

test('prioridade usa o item mais antigo da comanda', () => {
  const items = [{ created_at: sql(2, AGORA) }, { created_at: sql(30, AGORA) }]
  assert.equal(prioridadeDaComanda(items, AGORA).nivel, 'atrasado')
})

test('tempo decorrido em formato curto', () => {
  assert.equal(formatarDecorrido(sql(0, AGORA), AGORA + 30_000), '30 s')
  assert.equal(formatarDecorrido(sql(12, AGORA), AGORA), '12 min')
  assert.equal(formatarDecorrido(sql(125, AGORA), AGORA), '2 h 05')
})

test('autoria: usa quem lançou cada item e não inventa garçom', () => {
  const salao = [{ launched_by: 'Rafael' }, { launched_by: 'Juliana' }, { launched_by: 'Rafael' }]
  assert.deepEqual(autoriaDaComanda(salao), { nomes: ['Rafael', 'Juliana'], semGarcom: false })
  // sem registro do lançamento, cai no garçom da comanda
  assert.deepEqual(autoriaDaComanda([{ waiter_name: 'Carlos' }]).nomes, ['Carlos'])
  // salão sem ninguém: "Sem garçom atribuído"
  assert.equal(autoriaDaComanda([{ mesa: '4' }]).semGarcom, true)
  // iFood / online não ganham garçom inventado nem aviso de "sem garçom"
  assert.deepEqual(autoriaDaComanda([{ comanda_origem: 'ifood' }]), { nomes: [], semGarcom: false })
  assert.deepEqual(autoriaDaComanda([{ comanda_tipo_online: 'delivery' }]), { nomes: [], semGarcom: false })
})

test('autor por item', () => {
  assert.deepEqual(autorDoItem([{ launched_by: 'Ana' }, { launched_by: 'Ana' }, {}]), ['Ana'])
})

test('rótulo da mesa', () => {
  assert.equal(rotuloDaMesa({ mesa: '8' }), 'Mesa 8')
  assert.equal(rotuloDaMesa({ mesa: 'Online #1' }), 'Online #1')
  assert.equal(rotuloDaMesa({ mesa: 'iFood #4821', comanda_origem: 'ifood' }), null)
})

test('agrupa por comanda mantendo a ordem de chegada (sem reordenar números)', () => {
  const lista = [
    { id: 1, comanda_id: 20, mesa: '3' },
    { id: 2, comanda_id: 5, mesa: '1' },
    { id: 3, comanda_id: 20, mesa: '3' },
  ]
  const g = agruparPorComanda(lista)
  assert.deepEqual(g.map((c) => c.comanda_id), [20, 5])
  assert.equal(g[0].items.length, 2)
})
