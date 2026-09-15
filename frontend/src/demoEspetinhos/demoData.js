export const demoCategories = [
  { id: 'gado', label: 'Gado', icon: '◆' },
  { id: 'frango', label: 'Frango', icon: '●' },
  { id: 'todos', label: 'Todos', icon: '✦' },
  { id: 'queijos', label: 'Queijos', icon: '■' },
]

export const demoSkewers = [
  {
    id: 'gado-bacon', category: 'gado', name: 'Gado com Bacon', shortName: 'Gado + bacon',
    price: 15.9, image: '/demo-espetinhos/gado-bacon.png',
    description: 'Cubos de carne bovina suculenta intercalados com bacon, dourados lentamente na brasa.',
    asksPoint: true,
  },
  {
    id: 'coracao-frango', category: 'frango', name: 'Coração de Frango', shortName: 'Coração',
    price: 15.9, image: '/demo-espetinhos/coracao-frango.png',
    description: 'Corações bem temperados, grelhados até ficarem macios por dentro e dourados por fora.',
    asksPoint: true,
  },
  {
    id: 'queijo-coalho', category: 'queijos', name: 'Queijo Coalho', shortName: 'Queijo coalho',
    price: 13.9, image: '/demo-espetinhos/queijo-coalho.png',
    description: 'Cubos de queijo coalho tostados na brasa, com casquinha dourada e interior macio.',
    asksPoint: false,
  },
]
