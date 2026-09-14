# PDV Bosque da Carne

## Atualização da interface e correções — setembro de 2026

A interface foi reorganizada com navegação lateral, telas de atendimento, caixa em duas áreas e central de pedidos online por etapa. Cardápio, produção, relatórios, financeiro e telas públicas usam o mesmo padrão visual.

- Couvert só é cobrado depois de **Lançar couvert**; informar pessoas não adiciona cobrança. Serviço de 10% incide apenas no consumo, excluindo couvert.
- Pagamento parcial grava recebimento e preserva os itens na produção. Reabrir um número inicia outro atendimento sem apagar vendas anteriores.
- Relatórios e financeiro consultam recebimentos permanentes, incluindo pedidos online entregues. Há filtro por dia/intervalo e exportação CSV das vendas.
- Baixa de uma unidade na cozinha reduz somente o saldo de produção, preservando a quantidade vendida.
- Caixa e produção exigem senha validada no backend. Configure `PDV_CAIXA_PASSWORD` em `backend/.env`; se estiver vazio, use a senha temporária mostrada no terminal. Sessões duram 12 horas e são encerradas ao reiniciar o servidor. O acesso simplificado de garçom foi mantido, com permissões limitadas no servidor.

**Ao atualizar uma instalação existente:** pare o sistema, faça uma cópia do banco SQLite e mantenha seu `.env`. Atualize os arquivos de código; não rode o seed sobre a instalação em uso. As novas tabelas são criadas automaticamente na inicialização. Registros fechados ainda presentes são migrados para o histórico; vendas que a versão antiga já apagou não podem ser reconstruídas automaticamente. Valide os totais históricos com seu backup antes de usar em operação.

Requer Node.js 22. Para verificar: `cd backend && npm test`; no frontend, `npm run build`. Integrações externas de PIX e impressão física precisam ser verificadas no equipamento/configuração do restaurante.

Sistema completo de gerenciamento de restaurante para **garçons**, **cozinha**, **churrasqueira**, **bar** e **frente de caixa**. Funciona **localmente na rede Wi‑Fi** do restaurante, sem depender de internet.

## Tecnologias

- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Node.js + Express
- **Banco:** SQLite (arquivo local)
- **Tempo real:** Socket.io

## Como rodar na rede local

### 1. Instalar e iniciar o backend

```bash
cd backend
npm install
node seed.js    # só na primeira vez (cria cardápio e comandas 1-200)
npm start       # sobe em http://0.0.0.0:3001
```

### 2. Instalar e iniciar o frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev     # sobe em http://localhost:5173
```

### 3. Acessar de outros dispositivos na mesma rede

1. Descubra o IP do computador que está rodando (ex: `192.168.1.10`).
2. Nos celulares/tablets/TVs, abra o navegador e acesse: `http://192.168.1.10:5173`
3. Para o frontend conversar com o backend nesse IP, crie no `frontend` um arquivo `.env` com:
   ```env
   VITE_API_URL=http://192.168.1.10:3001
   ```
   Reinicie o `npm run dev` depois de criar o `.env`.

Assim, garçons (celular), cozinha, churrasqueira, bar e caixa podem usar o mesmo sistema na rede.

## Módulos

| Módulo        | Rota           | Uso                          |
|---------------|----------------|------------------------------|
| Início        | `/`            | Escolha do módulo            |
| Garçons       | `/garcons`     | Comandas 1–200, mesa, pedidos|
| Pedidos       | `/garcons/:id/pedidos` | Cardápio por categoria  |
| Cozinha       | `/cozinha`     | Pedidos + produção agrupada  |
| Churrasqueira | `/churrasqueira` | Espetinhos, ponto da carne  |
| Bar           | `/bar`         | Bebidas, caipirinhas, doses  |
| Caixa         | `/caixa`       | Conta, 10%, couvert, impressão, CPF |
| Relatórios    | `/admin`       | Vendas, faturamento, itens   |
| TV Churrasqueira | `/tv/churrasqueira` | Painel TV              |
| TV Cozinha    | `/tv/cozinha`  | Painel TV                    |
| TV Bar        | `/tv/bar`      | Painel TV                    |

## Regras do cardápio

- **Espetinhos e Alcatra:** perguntar ponto da carne (mal passado, ao ponto, bem passado).
- **Prato Feito:** escolher espetinho e ponto da carne.
- **Caipirinhas:** base (Cachaça/Vodka) e opção com/sem picolé.
- **Doses:** acompanhamento (Redbull, Coca, Coca Zero, Gelo de coco).

## Impressão

Na frente de caixa, ao clicar em **Imprimir comanda**, é gerada uma janela de impressão com logo BOSQUE DA CARNE, comanda, mesa, itens e total. Para impressora térmica PDV, use a impressão do navegador apontando para essa impressora.

## Nota fiscal (NFC-e)

Há campo para **CPF do cliente** na tela da comanda no caixa. A integração com emissor de NFC-e deve ser feita por sistema externo (API do emissor); o campo fica salvo no banco para uso futuro.
