# Como iniciar o PDV Bosque

## Iniciar o sistema (recomendado)

**Dê dois cliques em:** `iniciar-pdv.bat`

O script:
1. Prepara o sistema na primeira vez (compila o frontend, ~10 segundos)
2. Inicia **uma única janela** — "PDV Bosque - NAO FECHE" — com API e telas juntas
3. Espera o sistema responder de verdade e só então abre o navegador

- **Neste computador:** http://localhost:5173
- **Garçons (celular):** http://IP-DO-PC:5173 — o mesmo endereço de antes

Se algo ficar lento, a janela mostra linhas `[LENTO] horário MÉTODO /rota 1234ms`.
O limite é 700 ms e pode ser mudado com `PDV_SLOW_MS`.

**Depois de mudar o código do frontend**, rode `npm run build` na pasta `frontend` e reinicie.

O modo antigo (servidor de desenvolvimento, só para programar) continua em `iniciar-pdv-dev.bat`.

---

## Modo desenvolvimento (antigo)

**Dê dois cliques em:** `iniciar-pdv-dev.bat`

Esse script:
1. Abre o **backend** em uma janela (deixe aberta)
2. Abre o **frontend** em outra janela (deixe aberta)
3. Abre o **navegador** em duas abas:
   - **Sistema local** (caixa, garçons, cozinha, etc.): http://localhost:5173
   - **Cardápio web** (pedidos online): http://localhost:5173/pedir

Não feche as janelas do terminal onde aparecem "Backend" e "Frontend".

---

## Só iniciar o cardápio web (backend + frontend + abrir página)

**Dê dois cliques em:** `iniciar-cardapio-web.bat`

Esse script:
1. Abre o **backend** em uma janela (API do cardápio – deixe aberta)
2. Abre o **frontend** em outra janela (deixe aberta)
3. Abre o **navegador** só na página do **cardápio web**: http://localhost:5173/pedir

Use quando quiser só visualizar ou testar o pedido online, sem abrir o sistema do caixa.

---

## Só abrir o cardápio web (quando já está tudo rodando)

Se o backend e o frontend **já estão rodando**, use:

**Dê dois cliques em:** `abrir-cardapio-web.bat`

Isso abre no navegador a página de pedidos online: http://localhost:5173/pedir

---

## Resumo das URLs (com tudo rodando)

| O quê              | URL                      |
|--------------------|--------------------------|
| Sistema local (PDV)| http://localhost:5173    |
| Cardápio web       | http://localhost:5173/pedir |

---

## iPad ou celular na mesma rede Wi‑Fi (página em branco)

1. No **PC**, descubra o IPv4 (CMD/PowerShell: `ipconfig`) — ex.: `192.168.0.15`.
2. No tablet, abra **`http://192.168.0.15:5173`** (troque pelo seu IP). **Não** use `localhost` no iPad.
3. **Reinicie o frontend** depois de atualizar o projeto (`npm run dev` na pasta `frontend`), para aplicar a configuração do Vite.
4. Se ainda falhar: libere o **firewall** do Windows para as portas **5173** e **3001**.
5. Acessar pelo **nome do computador** (ex.: `http://Meu-PC:5173`) às vezes era bloqueado pelo Vite; o projeto agora permite qualquer host em desenvolvimento (`allowedHosts`).

---

## "API não encontrada" no cardápio web?

Isso aparece quando o **backend** não está rodando ou não está acessível.

1. **Confira as janelas do terminal:** deve haver uma janela com o título **"PDV Backend"** e a mensagem `PDV Bosque rodando em http://0.0.0.0:3001`. Se não houver, o backend não está no ar.

2. **Feche tudo e use de novo o `iniciar-pdv.bat`** – espere uns 10 segundos antes de usar o cardápio web.

3. **Teste direto no navegador:** abra http://localhost:3001/api/public/menu  
   - Se aparecer um JSON com `categories` e `items`, o backend está ok; recarregue a página do cardápio (F5) e clique em **"Tentar de novo"**.  
   - Se a página não abrir ou der erro, o backend não está rodando: abra a pasta `backend`, execute `npm start` e deixe essa janela aberta.
