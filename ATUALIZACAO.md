# Redesign do PDV

## Nova organização de caixa e financeiro

O caixa apresenta todas as comandas abertas em grade no topo, com as livres abaixo. Abertas usam verde, aguardando pagamento usam amarelo e livres usam cinza. Clicar em uma aberta mostra a conta em modal, mantendo consumo em tabela, lançamento de produtos e recebimento na base. Impressão e cobrança separada estão na barra do consumo; serviço, couvert e CPF ficam em uma seção expansível. Juntar comandas está disponível no topo da tela e nas opções da conta, junto de troca de mesa, troca de número e exclusão.

O financeiro foi reconstruído como livro-caixa: movimentações em tabela, busca por descrição, filtro de origem, entradas e despesas em formulários separados. A consulta por dia, semana, mês ou intervalo e o fechamento diário substituem os gráficos e cartões anteriores. Os totais usam as mesmas fontes e regras de cálculo existentes.

## Interface

Navegação agrupada em Atendimento, Produção e Gestão; cores sóbrias, ícones SVG, tipografia de sistema, tabelas legíveis e adaptação a celular. Caixa com lista de contas em atendimento, busca, produtos e resumo financeiro. Comandas disponíveis ficam recolhidas. Pedidos online têm colunas por etapa, filtro de canal, busca, histórico e painel lateral com cliente, endereço, itens, pagamento, impressão e ações.

Relatórios mantêm as oito consultas: resumo, comandas/recebimentos, evolução diária, produtos, categorias, churrasqueira, garçons e cancelamentos. A exportação CSV respeita o período selecionado. Salão considera pagamentos registrados; online considera pedidos entregues; dia operacional começa à 01:00. Valores de couvert são separados nos relatórios e já estão incluídos no subtotal dos itens, sem duplicação.

## Exemplo do cálculo corrigido

Consumo de R$ 100,00 + couvert lançado de R$ 10,00 + serviço de R$ 10,00 = R$ 120,00. Apenas informar duas pessoas, sem lançar o couvert, resulta em R$ 110,00 com serviço. Reabrir a comanda não herda pessoas, CPF ou taxa do atendimento anterior.

## Dados e execução

O pacote contém código e imagens originais do cardápio. Não inclui banco de dados, credenciais, dependências instaladas nem dados fictícios usados nos testes. Instale as dependências com `npm ci` nas pastas backend e frontend. Para instalação nova, execute o seed conforme README. Para instalação existente, preserve banco e configurações; faça backup antes de iniciar as migrações.

Autenticação administrativa passou ao servidor, incluindo Socket.IO. A consulta pública exige correspondência do telefone completo, em vez de aceitar consulta sem telefone ou só os quatro últimos dígitos. Isso preserva o acompanhamento existente; não é uma auditoria completa de segurança nem um sistema de identidade individual para garçons.

## Limites da validação

Verificação local: 15 testes automatizados aprovados; builds do PDV e do cardápio público aprovados; lint com zero erros e 11 avisos de dependências de hooks. Foram conferidas 16 rotas em computador e 8 telas em largura de celular, além de abertura de contas, etapas de pedidos, abas dos relatórios, CSV, formulários do cardápio, fotos públicas e acesso de operador. Os resultados detalhados acompanham a entrega em `verificacao-pdv.json`.

Os testes utilizam SQLite isolado e dados fictícios. A migração conserva o histórico que ainda existe, mas não recupera vendas já perdidas pela versão anterior. Pagamentos reais no Mercado Pago, impressora física e emissão fiscal não foram executados. NFC-e continua dependendo de integração externa. Não houve publicação, alteração de ambiente real ou envio ao GitHub.


## Baixa unitária na churrasqueira

O botão − conclui uma unidade por vez, atualizando a fila e o total de produção sem alterar a quantidade vendida ou o valor da comanda. Todos prontos continua disponível para concluir o grupo inteiro. Validado no navegador e com 16 testes do backend.


## Refinamento operacional

Cores padronizadas: comandas abertas em âmbar e livres em verde. Controles ampliados, foco de teclado visível e tipografia consistente. No caixa, cabeçalho e recebimento permanecem visíveis enquanto o conteúdo rola. Pedidos online separados em Novos pedidos, Em preparo, Prontos e Em entrega; mais antigos primeiro, tempo de espera e confirmação de atualização. Conferido em 1440px e 375px sem transbordamento horizontal da página.


## Recebimento e correções — 14/09/2026

União preserva taxas por origem e pagamentos anteriores. Produção paga pendente permanece em sessão separada ao reutilizar a comanda. Caixa recebe por unidade, valor parcial (adiantamento), divisão por pessoas e múltiplos meios, com troco exclusivamente em dinheiro e proteção contra repetição. Saldo retorna imediatamente no recebimento; grade e impressão usam valores pendentes. Pré-conta desconta adiantamentos e identifica taxas por origem. Escape e foco no modal, busca F2, filtro aguardando pagamento e prévia da união.

Turnos: abertura, suprimento, sangria, conferência de dinheiro/PIX/débito/crédito e histórico de diferenças. Registros sem turno aberto não entram na conferência de um turno posterior. PIX e cartões são registros manuais, sem integração com adquirente. Adiantamentos entram no financeiro ao receber; quantidades nos relatórios de produtos são liquidadas no pagamento final dos itens. Contas com recebimentos possuem restrições de alteração/cancelamento; estorno ainda não foi implementado.

22 testes backend passaram, build aprovado. Consumer instalado não acessível pela ferramenta desta sessão; adaptação visual fiel aguarda capturas do caixa, comandas e barra superior.

