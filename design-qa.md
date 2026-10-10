# Design QA — demonstração de espetinhos

**Source visual truth paths**
- `C:\Users\celei\AppData\Local\Temp\codex-clipboard-1f24963f-dd47-442f-a6ba-9bb8b08bd008.png`
- `C:\Users\celei\AppData\Local\Temp\codex-clipboard-1bdf8fb0-0cbb-49a9-816b-e49a8a471412.png`

**Implementation evidence**
- `prototype-home.png`
- `prototype-detail.png`
- `qa-home-comparison.png`
- `qa-detail-comparison.png`
- `delivery-full-menu.png`
- Route: `http://127.0.0.1:5175/demo-espetinhos`

**Viewport and normalization**
- Browser capture: 725 × 588 px at device scale 1; app shell: 480 px maximum width.
- Home source: 251 × 457 px. Detail source: 253 × 494 px.
- Full-view comparisons normalize both images to the same height while preserving aspect ratio. Browser chrome is excluded; the neutral desktop surround remains visible around the implementation shell.

**State**
- Home catalog with “Todos” selected.
- Gado com Bacon detail with “Ao ponto” selected and quantity 1.

**Full-view comparison evidence**
- Home: the search precedes a wide pale half-moon; category controls follow its upper arc; two product columns overlap the lower part of the curved region.
- Detail: identity, rating, price and facts occupy the upper-left; the transparent skewer expands to the upper-right and is deliberately clipped by the viewport; choices remain below and the purchase bar stays fixed.
- Intentional product adaptations: Bosque copy, green/ember palette, four real categories, skewer imagery, meat-point choices and Brazilian currency.

**Focused region evidence**
- Category region: generated transparent product images are clipped inside white circular controls; the selected grid control has a dark underline.
- Product hero: the skewer retains sharp transparent edges and a natural shadow at the enlarged crop.
- Controls: labels, prices and option states remain readable; touch targets are at least 40 px high.

**Required fidelity surfaces**
- Fonts and typography: compact sans-serif display hierarchy follows the reference; DM Sans provides clear weights and wrapping.
- Spacing and layout rhythm: header, search, curved category field, overlapping cards and split detail hero reproduce the reference structure.
- Colors and visual tokens: quiet white/gray base is retained and adapted to Bosque green and ember accents.
- Image quality and asset fidelity: all visible food assets are generated transparent PNGs in one consistent photographic style; no placeholder or CSS-drawn food assets remain.
- Copy and content: all customer-facing text is localized and specific to the Bosque da Carne catalog.

**Comparison history**
1. Earlier P1: categories floated on an oversized decorative ellipse and used text glyphs. Fix: rebuilt the region as a lower, wider half-moon, positioned controls along the arc, and inserted real product thumbnails plus the existing grid icon.
2. Earlier P1: selected product stayed centered with copy below. Fix: rebuilt the hero with copy at upper-left and a larger, right-aligned skewer clipped at the top/right.
3. Earlier P2: category thumbnails overflowed and collided with labels. Fix: clipped them inside 47 px circular controls and adjusted their crop.
4. Post-fix evidence: `qa-home-comparison.png` and `qa-detail-comparison.png` show no remaining actionable P0, P1, or P2 mismatch.
5. User review P1: card imagery crossed behind product names and the detail crop exposed too little of the skewer. Fix: reserved a clean image stage above card copy, moved the skewer beyond the card's top edge, and enlarged/repositioned the detail asset to expose substantially more of the product.
6. User review P2: “Com fome?” used a different typographic voice from the section heading. Fix: applied the same Fraunces display face, weight, color, and tight tracking used by “Espetinhos”.
7. Post-review evidence: refreshed home and detail captures confirm clean copy separation, deliberate card breakout, larger detail crop, and matching display typography.
8. User review P2: card images extended too far beyond their bounds. Fix: reduced card image width and height and limited the breakout to 52 px, preserving the floating effect without invading the category heading.
9. Authentic-photo correction: removed the 32 invented product substitutes. The delivery catalog now uses eleven transparent cutouts derived from every original Bosque photograph available in the repository, preserving the actual food, ingredients, color, and presentation.
10. Products without an authentic source photograph use the neutral fallback state until a real photo is supplied. `delivery-full-menu.png` records the corrected category and card treatment.
11. Category navigation was rebuilt as a true symmetrical half-moon: `Todos` is centered at the apex and four real categories descend on each side. All nine category filters were exercised in the browser.
12. The five authentic skewer cutouts were normalized geometrically to the same -58 degree axis, canvas occupancy, center, and shadow without changing their food pixels. Sandwich and plated-dish cards use separate consistent scale rules.
13. Product detail restores the agreed split hero: title, description, and price occupy the left half while enlarged food photography occupies the right half; additions and controls begin below both columns. Browser checks with a sandwich and a skewer confirmed that photography no longer covers copy or fields.
14. The Churraspão de coração now uses the distinct open-faced heart filling visible in its original Bosque photograph, instead of repeating the closed Churraspão image from the background of that source photo.
15. Category photography was removed from the half-moon. Nine equal 48 px controls now use dedicated line icons, horizontally equidistant centers, and vertical positions calculated from an elliptical half-moon curve; `Todos` stays at the exact apex. Endpoint labels were verified clear of the catalog and neighboring controls.
16. Items without a source photo no longer request guessed image filenames. They render immediately with the matching category icon and an explicit `Foto em breve` state.
17. Category priority now radiates from the center as requested: Espetinhos/Lanches, Porções/Acompanhamentos, Pratos/Sobremesas, then Bebidas/Caipirinhas. All icons were redrawn as a consistent 1.85 px line set with literal food and drink silhouettes.
18. Seven caipirinha product images now follow the supplied real Maracujá reference: the same tall cup, fruit texture, horizontal ice pop, angle, lighting, and transparent presentation, with the hand, clip, sign, and original background removed. Card and split-detail scale rules were verified separately for the tall drink silhouette.
19. A full-history audit of the original `vendas` repository found no source photographs for Gado com Bacon e Legumes, Kafta, Medalhão de Frango, or Medalhão de Mandioca. After receiving the product construction from the restaurant, those four were rebuilt in the existing real-photo style: beef with diced peppers/onion, handmade kafta burger with pepper/garlic, chicken medallions wrapped in bacon, and exactly five cassava cubes wrapped in bacon.
20. Product cards and their detail heroes now share one continuous 480 ms image transition. Browser captures at 160–170 ms confirmed that one image grows from the card into the right-side hero and returns to the original card position on close, without a duplicate crossfade. Reduced-motion users receive the immediate state change.
21. Cart and checkout were rebuilt from the supplied mobile payment reference using Bosque’s green and ember identity. The cart now shows authentic product thumbnails, inline quantity controls, receipt method, total, and a clear payment action. Checkout groups order review, receipt method/address, customer data, payment, note, and totals into compact editable blocks with a persistent confirmation button. Browser QA covered cart rendering, quantity controls, checkout navigation, payment selection, and delivery-address disclosure.
22. The menu search is now one clean control with a dedicated icon, focus state, descriptive placeholder, and working clear action. The recent-order link is now a structured status card showing the order number, purpose, tracking description, and a single “Ver” action; both align to the catalog grid on desktop and mobile.

**Primary interactions tested**
- Category filtering.
- Product selection and shared-element zoom.
- Escape/back return with focus restoration.
- Meat-point selection.
- Quantity decrease/increase and local add-to-cart state.
- Reduced-motion fallback is present.

**Console/build evidence**
- Vite production build passes.
- ESLint reports 0 errors and 12 pre-existing hook warnings outside this prototype.
- Backend suite passes 22/22.

**Follow-up polish**
- P3: add the remaining menu categories after their matching transparent product assets are generated.

final result: passed
