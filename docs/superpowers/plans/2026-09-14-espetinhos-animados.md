# Protótipo Animado de Espetinhos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma rota pública isolada que demonstre a escolha de espetinhos com categorias em meia-lua, imagens transparentes padronizadas e transição contínua do card para os detalhes.

**Architecture:** A rota `/demo-espetinhos` carregará uma página React autocontida e dados locais, sem chamar endpoints de pedidos. Componentes pequenos cuidarão da meia-lua, vitrine e detalhes; a View Transitions API dará continuidade à imagem, com fallback CSS e redução de movimento.

**Tech Stack:** React 19, React Router 7, CSS nativo, View Transitions API, imagens PNG transparentes geradas pelo recurso integrado de imagens, Vite 7 e QA no navegador.

## Global Constraints

- Não modificar o comportamento nem a apresentação da rota atual `/pedir`.
- Não criar pedido, pagamento, comanda ou escrita na API.
- Usar Gado com Bacon, Coração de Frango e Queijo Coalho na demonstração.
- Gerar os três produtos com fundo realmente transparente, mesmo ângulo, escala e iluminação.
- Usar verde profundo, âmbar, cobre e branco quente da identidade do Bosque da Carne.
- Manter animações entre 220 e 450 milissegundos e respeitar `prefers-reduced-motion`.
- Preservar foco visível, navegação por teclado e áreas de toque de pelo menos 44 px.

---

### Task 1: Coleção visual padronizada

**Files:**
- Create: `frontend/public/demo-espetinhos/gado-bacon.png`
- Create: `frontend/public/demo-espetinhos/coracao-frango.png`
- Create: `frontend/public/demo-espetinhos/queijo-coalho.png`

**Interfaces:**
- Consumes: nomes e características dos produtos definidos em `backend/seed.js`.
- Produces: três PNGs RGBA quadrados, acessíveis em `/demo-espetinhos/<arquivo>.png`.

- [ ] **Step 1: Gerar Gado com Bacon**

Usar o gerador integrado com este pedido:

```text
Use case: product-mockup
Asset type: produto recortado para cardápio móvel animado
Primary request: um único espetinho brasileiro de cubos de carne bovina alternados com bacon, grelhado e apetitoso
Style/medium: fotografia gastronômica realista de estúdio
Composition/framing: espetinho inteiro na diagonal inferior esquerda para superior direita, centralizado, margem transparente ampla, vista três quartos
Lighting/mood: luz quente lateral inspirada em churrasqueira, contraste natural e brilho moderado
Constraints: fundo realmente transparente; somente um espetinho e seu palito; sem prato, mãos, texto, logo, fumaça, guarnição ou cenário; formato quadrado
```

Salvar o resultado final como `frontend/public/demo-espetinhos/gado-bacon.png`.

- [ ] **Step 2: Gerar Coração de Frango com o mesmo padrão**

Repetir o pedido anterior alterando apenas o assunto para “um único espetinho brasileiro de corações de frango grelhados”. Preservar composição, escala, luz e todas as restrições. Salvar como `coracao-frango.png`.

- [ ] **Step 3: Gerar Queijo Coalho com o mesmo padrão**

Repetir o pedido anterior alterando apenas o assunto para “um único espetinho brasileiro de cubos de queijo coalho dourados na brasa”. Preservar composição, escala, luz e todas as restrições. Salvar como `queijo-coalho.png`.

- [ ] **Step 4: Verificar transparência e dimensões**

Run:

```powershell
python -c "from PIL import Image; from pathlib import Path; files=list(Path('frontend/public/demo-espetinhos').glob('*.png')); print([(p.name, Image.open(p).mode, Image.open(p).size, Image.open(p).getextrema()[-1][0]) for p in files])"
```

Expected: três arquivos em modo `RGBA`, mesma dimensão e canal alfa com mínimo `0`.

- [ ] **Step 5: Commit**

```powershell
git add frontend/public/demo-espetinhos
git commit -m "Adiciona imagens padronizadas dos espetinhos"
```

### Task 2: Página demonstrativa e meia-lua de categorias

**Files:**
- Create: `frontend/src/demoEspetinhos/demoData.js`
- Create: `frontend/src/demoEspetinhos/CategoryArc.jsx`
- Create: `frontend/src/demoEspetinhos/EspetinhosDemo.jsx`
- Create: `frontend/src/demoEspetinhos/espetinhosDemo.css`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: arquivos `/demo-espetinhos/*.png` da Task 1.
- Produces: `EspetinhosDemo()`, rota pública `/demo-espetinhos` e `CategoryArc({ categories, activeId, onSelect })`.

- [ ] **Step 1: Definir dados locais**

Criar `demoData.js` com a exportação:

```js
export const demoCategories = [
  { id: 'gado', label: 'Gado' },
  { id: 'frango', label: 'Frango' },
  { id: 'queijos', label: 'Queijos' },
  { id: 'todos', label: 'Todos' },
]

export const demoSkewers = [
  { id: 'gado-bacon', category: 'gado', name: 'Gado com Bacon', price: 15.9, image: '/demo-espetinhos/gado-bacon.png', description: 'Carne bovina suculenta intercalada com bacon, dourada na brasa.', asksPoint: true },
  { id: 'coracao-frango', category: 'frango', name: 'Coração de Frango', price: 15.9, image: '/demo-espetinhos/coracao-frango.png', description: 'Corações bem temperados, grelhados até ficarem macios e dourados.', asksPoint: true },
  { id: 'queijo-coalho', category: 'queijos', name: 'Queijo Coalho', price: 13.9, image: '/demo-espetinhos/queijo-coalho.png', description: 'Queijo coalho tostado por fora e macio por dentro.', asksPoint: false },
]
```

- [ ] **Step 2: Criar meia-lua acessível**

Criar `CategoryArc.jsx` com um `nav` rotulado “Categorias de espetinhos”. Distribuir quatro botões ao longo de um arco por classes CSS, marcar o ativo com `aria-current="true"` e chamar `onSelect(category.id)` no toque.

- [ ] **Step 3: Montar a vitrine isolada**

Criar `EspetinhosDemo.jsx` com estados `activeCategory`, `selectedId`, `quantity`, `meatPoint` e `cartCount`. Filtrar `demoSkewers` sem API e renderizar logo, meia-lua, cards, detalhes e indicador local do carrinho.

- [ ] **Step 4: Registrar rota pública**

Em `App.jsx`, adicionar:

```jsx
const EspetinhosDemo = lazy(() => import('./demoEspetinhos/EspetinhosDemo'))
// dentro de Routes
<Route path="/demo-espetinhos" element={<EspetinhosDemo />} />
```

Incluir `/demo-espetinhos` na condição `publicPage`, sem modificar o elemento da rota `/pedir`.

- [ ] **Step 5: Estilizar estrutura e responsividade**

Em `espetinhosDemo.css`, definir tokens sob `.skewer-demo`, meia-lua com `border-radius: 0 0 50% 50%`, vitrine em duas colunas no celular, cards sem fundo atrás da imagem e detalhes com ação fixa inferior. Em telas largas, limitar a experiência a 480 px e centralizá-la como uma simulação móvel.

- [ ] **Step 6: Verificar build e isolamento**

Run:

```powershell
cd frontend
npm run build
```

Expected: build concluído e chunks separados para `EspetinhosDemo`; nenhum erro.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/App.jsx frontend/src/demoEspetinhos
git commit -m "Cria demonstracao móvel de espetinhos"
```

### Task 3: Transições contínuas e interações

**Files:**
- Create: `frontend/src/demoEspetinhos/useDemoTransition.js`
- Modify: `frontend/src/demoEspetinhos/EspetinhosDemo.jsx`
- Modify: `frontend/src/demoEspetinhos/espetinhosDemo.css`

**Interfaces:**
- Consumes: `selectedId`, setters da página e elementos com `data-skewer-id`.
- Produces: `runDemoTransition(update: () => void): void`, animação compartilhada por `view-transition-name` e fallback imediato.

- [ ] **Step 1: Criar controlador de transição**

Criar `useDemoTransition.js`:

```js
export function runDemoTransition(update) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || !document.startViewTransition) {
    update()
    return
  }
  document.startViewTransition(update)
}
```

- [ ] **Step 2: Conectar card e detalhes**

Antes de alterar `selectedId`, definir o produto ativo e executar a atualização com `runDemoTransition`. Aplicar `style={{ viewTransitionName: selectedId === item.id ? 'active-skewer' : `skewer-${item.id}` }}` na imagem correspondente, mantendo a mesma URL no card e nos detalhes.

- [ ] **Step 3: Animar troca de categorias**

Ao selecionar a meia-lua, usar `runDemoTransition(() => setActiveCategory(id))`. Aplicar entrada escalonada aos cards com `animation-delay` calculado por índice. A saída deve reduzir para `scale(.94)` e a entrada terminar em `scale(1)`.

- [ ] **Step 4: Animar conteúdo dos detalhes**

Fazer título, descrição, preço, ponto, quantidade e ação entrarem em sequência. Usar duração total máxima de 450 ms e limitar transformações a `translate` e `scale`.

- [ ] **Step 5: Animar inclusão no carrinho visual**

O botão “Adicionar” incrementará somente `cartCount`, exibirá “Adicionado ao carrinho” e aplicará uma animação curta na imagem e no contador. Não importar funções de `api.js`.

- [ ] **Step 6: Implementar redução de movimento**

Adicionar:

```css
@media (prefers-reduced-motion: reduce) {
  .skewer-demo *, .skewer-demo *::before, .skewer-demo *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/demoEspetinhos
git commit -m "Anima escolha e detalhes dos espetinhos"
```

### Task 4: QA visual, acessibilidade e ausência de efeitos no PDV

**Files:**
- Modify if necessary: `frontend/src/demoEspetinhos/EspetinhosDemo.jsx`
- Modify if necessary: `frontend/src/demoEspetinhos/espetinhosDemo.css`

**Interfaces:**
- Consumes: rota `/demo-espetinhos` finalizada.
- Produces: protótipo revisado e evidências de funcionamento em navegador.

- [ ] **Step 1: Validar fluxo móvel em 375 × 812**

Abrir `/demo-espetinhos`; confirmar visualmente meia-lua, três produtos, toque em categoria, aproximação do produto, retorno à vitrine, ponto da carne, quantidade e carrinho local.

- [ ] **Step 2: Validar teclado**

Usar Tab, Enter e Escape. Esperado: foco visível; categorias e produtos acionáveis; Escape fecha detalhes e devolve foco ao produto aberto.

- [ ] **Step 3: Validar redução de movimento**

Emular `prefers-reduced-motion: reduce`. Esperado: todas as mudanças de estado permanecem funcionais e praticamente instantâneas.

- [ ] **Step 4: Confirmar ausência de escrita na rede**

Observar as requisições durante categoria, detalhes, quantidade e carrinho. Esperado: somente arquivos estáticos; nenhuma requisição `POST`, `PATCH`, `PUT` ou `DELETE`.

- [ ] **Step 5: Regressão mínima**

Abrir `/pedir`, `/caixa` e `/garcons`. Esperado: carregamento e conteúdo anteriores preservados. Executar novamente:

```powershell
cd frontend
npm run build
npm run lint
```

Expected: build aprovado; lint com zero erros e somente os avisos preexistentes.

- [ ] **Step 6: Commit dos ajustes de QA**

Se houver ajustes, registrar apenas os arquivos do protótipo:

```powershell
git add frontend/src/demoEspetinhos frontend/src/App.jsx
git commit -m "Refina demonstracao animada de espetinhos"
```
