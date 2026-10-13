# Bot de trade cripto: Binance Futures (alta e baixa) + Telegram

Bot baseado no [Freqtrade](https://www.freqtrade.io) 2026.9. Ele opera **comprado (long) na alta e vendido (short) na baixa** em futuros USDT-M da Binance, e você controla tudo pelo Telegram.

> **Aviso:** nenhuma estratégia garante lucro sempre. O que este bot garante é o **limite de perda** de cada operação e da conta: stop-loss registrado na própria corretora, risco fixo por trade e pausas automáticas. O backtest abaixo mostra anos bons e ruins. Comece em simulação (dry-run) e só use dinheiro que você aceita perder.

## Estratégia: `DonchianAtrLongShort` (gráfico de 4h)

| Item | Regra |
|---|---|
| Regime | EMA 50 acima da EMA 200: só long. EMA 50 abaixo da EMA 200: só short. |
| Entrada | Fechamento rompe a máxima (long) ou a mínima (short) dos últimos 20 candles, com ADX > 20 |
| Stop inicial | 2,5 x ATR, enviado como ordem stop na Binance (protege mesmo com o PC desligado) |
| Stop móvel | Extremo desde a entrada menos 3 x ATR. Só anda a favor e deixa o lucro correr. |
| Saída por sinal | Rompimento do canal contrário de 10 candles |
| Tamanho da posição | Arrisca 1% do saldo até o stop. Margem isolada, alavancagem máxima de 2x, até 3 posições. |
| Proteções | Pausa de 24h se cair 3% em 24h. Pausa de 7 dias se cair 12% em 30 dias. Pausa após 3 stops em 24h. |
| Pares | ETH, SOL, BNB, XRP, DOGE, LINK, AVAX e ADA (todos /USDT perpétuo) |

### Backtest (dados reais da Binance, simulação intra-candle de 1h, com taxas e funding)

Período de jan/2022 a set/2026, 8 pares, carteira de 99 USDT (cerca de R$ 500):

| Métrica | Resultado |
|---|---|
| Lucro total | +69,7% (cerca de 12% ao ano) |
| Profit factor | 1,16 |
| Queda máxima da conta | cerca de 26% |
| Trades | 787 (cerca de 1 a cada 2 dias), com 34% de acerto |
| Long / Short | +45% / +25% |

Por ano, em simulação com 1.990 USDT (cerca de R$ 10 mil):

| Ano | Resultado em USDT | Profit factor |
|---|---|---|
| 2022 | -6 (empate) | 0,99 |
| 2023 | +623 | 1,49 |
| 2024 | +291 | 1,15 |
| 2025 | +756 | 1,38 |
| 2026 (até set) | **-474** | 0,79 |

Como ler esses números:
- A taxa de acerto é baixa (cerca de 34%), mas os ganhos são maiores que as perdas. Isso é normal em estratégia de tendência. Haverá **sequências longas de stops**, e o bot não deve ser desligado no meio delas.
- 2026 está negativo até agora. Um mercado lateral é o pior cenário para essa estratégia.
- A estratégia foi desenvolvida com dados de 2022 a 2024 e validada em 2025 e 2026 sem nenhum ajuste.
- Uma primeira versão (pullback em EMA no gráfico de 1h) perdeu -18,6% no backtest e foi descartada.
- Resultado passado não garante resultado futuro.

### Limitações de uma conta de R$ 500
- A Binance exige um valor mínimo por ordem: 20 USDT para ETH e LINK, e 5 USDT para os demais pares. O BTC exige 0,001 BTC (mais de 100 USDT), por isso ficou fora da lista.
- Com saldo pequeno, algumas ordens saem no mínimo da corretora. Nesses casos o bot aceita no máximo 2% de risco no trade; acima disso, a entrada é pulada.
- Com R$ 500, o objetivo é **testar o funcionamento**, não gerar renda. Com o resultado médio do backtest, isso daria cerca de R$ 5 por mês.

## Passo a passo

### 1. Binance
1. **Futuros:** abra Derivativos > Futuros USDⓈ-M e ative a conta de futuros (há um questionário). Se a opção não aparecer para a sua conta, avise, porque o plano muda para operar só long no spot.
2. **Modo de posição:** em Futuros > Preferências, deixe o modo de posição em **One-way**, que é obrigatório para o Freqtrade, e o **Multi-Assets Mode desligado**.
3. **Converter o PIX em USDT:** use Converter (BRL para USDT) e depois Transferir da carteira **Spot** para a **USDⓈ-M Futures**.
4. **Chave de API:** em Perfil > API Management > Create API (System generated):
   - marque **Enable Reading** e **Enable Futures**
   - **NUNCA** marque Enable Withdrawals
   - restrinja ao IP do seu computador (veja seu IP em https://meuip.com.br)

### 2. Telegram
1. Fale com o [@BotFather](https://t.me/BotFather), envie `/newbot` e copie o **token**.
2. Fale com o [@userinfobot](https://t.me/userinfobot) e copie o seu **chat_id**.
3. Mande qualquer mensagem para o seu bot novo, para ele poder falar com você.

### 3. Rodar no seu computador (Windows, Mac ou Linux)
1. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) e o [Git](https://git-scm.com).
2. No terminal:

```bash
git clone <url-deste-repositorio>
cd <repositorio>/trading-bot
cp .env.example .env      # no Windows: copy .env.example .env
```

3. Preencha o `.env` com a chave da API, o secret, o token e o chat_id. Deixe `FREQTRADE__DRY_RUN=true`.
4. Inicie o bot:

```bash
docker compose pull
docker compose up -d
docker compose logs -f     # Ctrl+C sai dos logs; o bot continua rodando
```

5. No Telegram, envie `/start` e depois `/status`. O painel web fica em http://localhost:8080.

### 4. Ir para dinheiro real
1. Deixe rodar em **dry-run por pelo menos 1 a 2 semanas** e confira se as entradas, os stops e as mensagens chegam como esperado.
2. Mude para `FREQTRADE__DRY_RUN=false` no `.env` e rode `docker compose up -d` de novo.
3. Na Binance, confira se cada posição aberta tem uma ordem **Stop Market** correspondente.

### Comandos úteis no Telegram

| Comando | O que faz |
|---|---|
| `/status` | Trades abertos |
| `/profit` | Lucro acumulado |
| `/balance` | Saldo |
| `/daily` | Resultado por dia |
| `/performance` | Resultado por par |
| `/stopentry` | Para de abrir trades novos (mantém os abertos) |
| `/forceexit all` | Fecha tudo agora, a mercado |
| `/stop` / `/start` | Pausa ou retoma o bot |

## Reproduzir o backtest

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install freqtrade==2026.9

# No Brasil a API funciona normalmente:
freqtrade download-data -c user_data/config.json --userdir user_data --timeframes 1h 4h --timerange 20220101-
# Alternativa (servidores onde a API da Binance é bloqueada, como nos EUA):
python scripts/download_binance_vision.py --pairs ETH SOL BNB XRP DOGE LINK AVAX ADA --start 2022-01 --end 2026-09

freqtrade backtesting -c user_data/config.json --userdir user_data \
  --timerange 20220101- --timeframe-detail 1h --breakdown year
```

O arquivo `user_data/config.restricted-region.json` só serve para rodar backtests a partir de servidores onde a API da Binance está bloqueada (acrescente `-c user_data/config.restricted-region.json` ao comando). **Não use esse arquivo para operar.**

## Próximos passos
- Servidor na nuvem: use uma VPS **no Brasil** (AWS São Paulo, `sa-east-1`, ou um provedor nacional). A Binance bloqueia IPs dos EUA, e um IP no mesmo país do seu cadastro evita bloqueios na conta.
- Pesquisa de novas estratégias, como reversão à média para mercados laterais (o ponto fraco desta estratégia), validadas fora da amostra antes de entrar no bot.
- Relatório semanal no Telegram com Sharpe, drawdown e comparação com buy and hold.
