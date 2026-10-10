# Prompts das imagens que faltam no cardápio online (28 imagens)

Para gerar as fotos dos itens que ainda aparecem como "Foto em breve" no delivery.

## Como usar

1. Cole o **PROMPT BASE** e, logo depois, a linha do item (um prompt por imagem).
2. Gere **quadrado 1:1**, na maior resolução que o software permitir (ideal 2048 px ou mais).
3. Se o software aceitar, anexe uma foto já existente (ex.: `gado-com-bacon.png`) como **referência de estilo**,
   para as novas imagens ficarem parecidas com as atuais.
4. A maioria dos geradores não entrega fundo transparente: gere em **fundo branco puro** e remova o fundo
   (remove.bg, Photoshop, Canva "Remover plano de fundo", `rembg`). O site precisa de **PNG com fundo transparente**.
5. Salve com o **nome do arquivo** indicado abaixo, na pasta `frontend/public/menu-real-cutouts/`.
6. Não precisa mexer em código: o delivery procura sozinho a imagem pelo nome do arquivo (nome do item em minúsculas, sem acento, com hífens). Salvou com o nome certo, ela aparece.

> Dica de tamanho: as fotos atuais têm 1254×1254 px e pesam de 0,7 a 2,6 MB. Para o site ficar rápido,
> exporte as novas em **1254×1254 ou 1600×1600** e comprima (TinyPNG). Mais que isso deixa o delivery lento no celular.

## PROMPT BASE (cole antes de cada item)

```
Professional commercial food and beverage product photography, photorealistic, ultra detailed, sharp focus,
studio softbox lighting from the upper left with a subtle rim light, natural soft contact shadow,
the subject centered and isolated on a pure white background (#FFFFFF), square 1:1 composition,
camera slightly above at a 3/4 front angle (about 25 degrees), appetizing warm colors, high dynamic range,
8k texture detail, restaurant menu photography style. No text overlays, no watermark, no hands, no people,
no extra props other than the ones described.
```

## NEGATIVE PROMPT (se o software tiver o campo)

```
illustration, cartoon, 3d render, drawing, painting, blurry, low resolution, plastic look, oversaturated,
distorted logo, misspelled text, extra objects, cropped subject, busy background, hands, people, watermark
```

---

## ITENS — nome do arquivo e prompt do item

### Bebidas

| Arquivo | Prompt do item |
|---|---|
| `coca-cola-350ml.png` | A single 350 ml Coca-Cola aluminum can, classic red can with the white Coca-Cola script logo, cold condensation droplets on the surface, upright. |
| `fanta-350ml.png` | A single 350 ml Fanta Orange aluminum can, bright orange can with the Fanta logo and orange fruit artwork, cold condensation droplets, upright. |
| `guarana-350ml.png` | A single 350 ml Brazilian guaraná soda aluminum can in the style of Guaraná Antarctica, green can with the guaraná fruit artwork, cold condensation droplets, upright. |
| `redbull.png` | A single 250 ml Red Bull slim aluminum can, blue and silver with the two red bulls and yellow sun logo, cold condensation droplets, upright. (Esta imagem também serve para "Red Bull" em Doses.) |
| `suco-prats.png` | A single-serve Prats orange juice, packaging with an orange fruit illustration and fresh orange look, cold condensation, upright. (Use a embalagem real que vocês vendem: caixinha ou garrafa.) |
| `agua-com-ou-sem-gas.png` | A 500 ml clear plastic mineral water bottle with a light blue label and blue cap, cold condensation droplets, upright. |

### Chopp / Cerveja

| Arquivo | Prompt do item |
|---|---|
| `heineken-600ml.png` | A 600 ml Heineken green glass beer bottle with the red star label, silver foil neck, cold condensation droplets, upright. |
| `jordana-pilsen.png` | A tall tulip glass of golden pilsner draft beer (chopp) with a thick white foam head and rising bubbles, cold condensation on the glass. |
| `original-600ml.png` | A 600 ml Antarctica Original brown glass beer bottle with the gold label, cold condensation droplets, upright. |
| `submarino-jagermeister.png` | A "submarino" drink: a beer glass of golden draft beer with foam, and a small shot glass of dark Jägermeister herbal liqueur partially submerged inside the beer, bubbles, condensation. |
| `submarino-steinhaeger.png` | A "submarino" drink: a beer glass of golden draft beer with foam, and a small shot glass of clear Steinhäger gin partially submerged inside the beer, bubbles, condensation. |

### Doses

| Arquivo | Prompt do item |
|---|---|
| `campari.png` | A short glass with a dose of Campari, vivid ruby red bitter liqueur, a single large ice cube, thin orange slice on the rim. |
| `cu-de-burro.png` | A shot glass of Brazilian cachaça served "cú de burro" style: a squeezed lime wedge and a pinch of coarse salt beside the shot, translucent amber-clear liquor. |
| `jack-daniels-100ml.png` | A whiskey tumbler with a 100 ml dose of Jack Daniel's Tennessee whiskey, warm amber color, one ice cube. |
| `jagermeister-100ml.png` | A short tumbler with a dose of Jägermeister, very dark brown herbal liqueur, ice cubes, cold condensation. |
| `pinga-da-casa.png` | A small traditional shot glass of clear Brazilian cachaça (pinga), clean and transparent, on a white background. |
| `smirnoff-100ml.png` | A short tumbler with a 100 ml dose of Smirnoff vodka, crystal clear liquid, ice cubes, cold condensation. |

### Drinks

| Arquivo | Prompt do item |
|---|---|
| `caipicerva.png` | A "caipicerva": a short glass of lime caipirinha with lime wedges and crushed ice, and an open green longneck beer bottle standing beside it, condensation. |
| `jack-tropical.png` | A tall glass of "Jack Tropical" cocktail: Jack Daniel's with pineapple and orange juice, yellow-orange gradient, ice cubes, pineapple wedge and orange slice garnish, straw. |
| `soda-italiana-de-cranberry.png` | A tall glass of non-alcoholic Italian soda with cranberry: translucent ruby-pink sparkling drink, ice cubes, bubbles, a few cranberries and a lime slice garnish, straw. |
| `soda-italiana-de-maca-verde.png` | A tall glass of non-alcoholic Italian soda with green apple: translucent bright green sparkling drink, ice cubes, bubbles, a green apple slice garnish, straw. |

### Porções, acompanhamentos, prato e sobremesa

| Arquivo | Prompt do item |
|---|---|
| `alcatra-600g.png` | 600 g of grilled alcatra (top sirloin) sliced on a hot wooden serving board, juicy medium-rare center, served with bread rolls and a small bowl of mayonnaise. |
| `asinha-de-frango.png` | 600 g of golden grilled chicken wings (asinhas) on a plate, served with a bowl of 200 g mayonnaise and bread rolls. |
| `linguica-toscana.png` | 600 g of grilled Tuscan sausages (linguiça toscana), diagonally sliced, on a wooden board with a bowl of 200 g mayonnaise and bread rolls. |
| `arroz.png` | A white ceramic bowl of fluffy white rice, side dish portion, steam rising lightly. |
| `maionese-caseira.png` | A white ceramic bowl of creamy Brazilian homemade mayonnaise (maionese caseira), light yellow-white, with a small parsley sprig. |
| `arvoredo.png` | "Arvoredo" sharing platter: 700 g of grilled Argentine fillet steak sliced on a large board, served for two with white rice, mayonnaise and fresh salad (lettuce, tomato, onion). |
| `petit-gateau.png` | A chocolate petit gâteau cut open with molten chocolate center on a white plate, with two scoops of vanilla ice cream and a fresh strawberry, chocolate sauce drizzle. |

---

## Observações

- **Marcas:** latas e garrafas com rótulo de marca saem melhores se você usar a **foto real do produto**
  (o gerador costuma errar o logotipo). Se preferir, gere sem texto e use a foto oficial da embalagem.
- **Couvert** não precisa de imagem: ele deve ficar só no PDV (não aparece no cardápio online).
- **Itens com o mesmo nome em categorias diferentes** (Coca-Cola, Red Bull em "Doses") usam a mesma imagem.
- Se algum item tiver outro tamanho ou embalagem real (Suco Prats, Arvoredo), ajuste o prompt antes de gerar.
