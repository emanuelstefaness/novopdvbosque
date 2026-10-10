# Protótipo animado de espetinhos do Bosque da Carne

## Objetivo

Criar uma demonstração móvel, isolada do fluxo atual de pedidos, que apresente os espetinhos do Bosque da Carne com a organização e a continuidade visual observadas no vídeo enviado. A demonstração permitirá avaliar o conceito antes de aplicá-lo ao cardápio online completo.

## Escopo

O protótipo será uma nova rota pública de demonstração. Ele não substituirá a tela `/pedir`, não enviará pedidos à API e não alterará carrinho, caixa, comandas, produção ou pagamentos.

A demonstração terá três produtos: Gado com Bacon, Coração de Frango e Queijo Coalho. Eles serão suficientes para validar troca de categorias, animação do produto, detalhes, escolhas e inclusão em um carrinho visual local.

## Direção visual

A interface terá fundo claro, bastante espaço em branco e hierarquia semelhante à do aplicativo do vídeo. A identidade continuará pertencendo ao Bosque da Carne:

- verde profundo para navegação e ações principais;
- âmbar e cobre para preço, seleção e referências à brasa;
- branco quente para o fundo;
- tipografia sólida e legível, com um título mais expressivo apenas nos nomes dos produtos;
- detalhes de madeira usados com discrição, sem textura sobre textos ou controles.

A assinatura da tela será uma meia-lua de categorias na parte superior. As opções serão Gado, Frango, Queijos e Todos. A categoria ativa ficará no centro visual e terá contraste maior.

## Imagens dos produtos

As três imagens serão geradas novamente como uma coleção padronizada. Cada arquivo mostrará um único espetinho:

- fundo realmente transparente;
- enquadramento diagonal idêntico;
- mesma distância e proporção;
- luz quente lateral, semelhante à luz da churrasqueira;
- textura natural e aparência apetitosa;
- sem prato, mãos, texto, logotipo, fumaça recortada ou elementos de cenário;
- área transparente suficiente ao redor para permitir escala e movimento.

Os arquivos finais ficarão dentro dos recursos públicos do frontend e terão nomes específicos do protótipo, sem substituir as fotos atuais do cardápio.

## Fluxo e movimento

### Entrada

Logo, saudação e meia-lua de categorias entram primeiro. Os produtos aparecem em seguida, com um pequeno intervalo entre os cards.

### Troca de categoria

Ao selecionar uma categoria, os produtos atuais reduzem levemente e desaparecem. Os novos produtos entram da direção correspondente da meia-lua. O movimento será curto e responderá imediatamente ao toque.

### Produto para detalhes

Ao tocar em um espetinho, a mesma imagem se desloca e aumenta até a posição de destaque da tela de detalhes. A continuidade da imagem deve fazer o usuário perceber que abriu aquele produto, sem um corte visual. Nome, descrição, preço, escolhas e botão aparecem depois em sequência.

Gado com Bacon e Coração de Frango mostrarão a escolha do ponto da carne. Queijo Coalho não mostrará essa etapa. A quantidade poderá ser aumentada ou reduzida.

### Carrinho visual

Ao adicionar, o espetinho diminui em direção ao indicador do carrinho. O protótipo atualizará a quantidade e exibirá uma confirmação discreta. Tudo permanecerá apenas no estado local da demonstração.

### Acessibilidade e desempenho

As animações principais durarão entre 220 e 450 milissegundos. A interface respeitará `prefers-reduced-motion`, preservará foco de teclado, manterá áreas de toque adequadas e evitará efeitos pesados. As imagens transparentes serão otimizadas para carregamento móvel.

## Estrutura técnica

O protótipo será implementado em componentes próprios e CSS isolado. Uma rota exclusiva permitirá abrir e remover a demonstração sem interferir no restante do sistema. Os dados dos três produtos serão locais e claramente marcados como demonstração.

Os componentes terão responsabilidades separadas:

- página do protótipo: controla categoria, produto aberto e carrinho visual;
- meia-lua: apresenta e seleciona categorias;
- vitrine: organiza e anima os produtos;
- detalhes: apresenta escolhas e quantidade;
- transição do produto: mantém a continuidade entre card e detalhes.

## Validação

O protótipo será testado em largura móvel e desktop. A verificação cobrirá entrada, troca de categoria, abertura e fechamento dos detalhes, escolha de ponto, quantidade, adição ao carrinho, teclado, redução de movimento e ausência de chamadas de criação de pedido.

O conceito estará aprovado para expansão quando a navegação parecer natural, as imagens mantiverem um padrão consistente e a aproximação do espetinho funcionar sem salto ou troca perceptível de imagem.
