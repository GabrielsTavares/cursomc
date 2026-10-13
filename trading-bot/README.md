# Bot de trade cripto: Binance Futures (alta e baixa) + Telegram

Bot baseado no [Freqtrade](https://www.freqtrade.io) 2026.9. Ele opera **comprado (long) na alta e vendido (short) na baixa** em futuros USDT-M da Binance, e você controla tudo pelo Telegram. Acompanham o bot um relatório semanal de desempenho, a exportação dos trades em reais para o IR e um script de backup.

> **Aviso:** nenhuma estratégia garante lucro sempre. O que este bot garante é o **limite de perda** de cada operação e da conta: stop-loss registrado na própria corretora, risco fixo por trade e pausas automáticas. O backtest abaixo mostra anos bons e ruins. Comece em simulação (dry-run) e só use dinheiro que você aceita perder.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `user_data/strategies/DonchianAtrLongShort.py` | Estratégia (a única carregada pelo bot) |
| `user_data/config.json` | Configuração: futuros, margem isolada, dry-run ligado, pares |
| `reporting/` | Relatório semanal no Telegram e exportação para o IR |
| `scripts/` | Download de dados históricos e backup do banco |
| `research/discarded_strategies/` | Estratégias testadas e reprovadas (não são carregadas) |
| `tests/` | Testes automatizados (`python -m pytest tests`) |
| `docker-compose.yml` | Serviços `freqtrade` (o bot) e `weekly-report` (o relatório) |

## Estratégia: `DonchianAtrLongShort` (gráfico de 4h)

| Item | Regra |
|---|---|
| Regime | EMA 50 acima da EMA 200: só long. EMA 50 abaixo da EMA 200: só short. |
| Entrada | Fechamento rompe a máxima (long) ou a mínima (short) dos últimos 20 candles, com ADX > 20 |
| Stop inicial | 2,5 x ATR, **nunca mais de 10% do preço**, enviado como ordem stop na Binance (protege mesmo com o PC desligado) |
| Filtro de volatilidade | Não entra se o stop precisar ficar a mais de 10% (crashes como o da FTX) |
| Stop móvel | Extremo desde a entrada menos 3 x ATR. Só anda a favor e deixa o lucro correr. |
| Saída por sinal | Rompimento do canal contrário de 10 candles |
| Tamanho da posição | Arrisca 1% do saldo até o stop. Margem isolada, alavancagem máxima de 2x, até 3 posições. |
| Proteções | Pausa de 24h se cair 3% em 24h. Pausa de 7 dias se cair 12% em 30 dias. Pausa após 3 stops em 24h. |
| Pares | ETH, SOL, BNB, XRP, DOGE, LINK, AVAX e ADA (todos /USDT perpétuo) |

### Backtest (dados reais da Binance, simulação intra-candle de 1h, com taxas e funding)

Período de jan/2022 a set/2026, 8 pares, carteira de 99 USDT (cerca de R$ 500):

| Métrica | Resultado |
|---|---|
| Lucro total | +70,1% (cerca de 12% ao ano) |
| Profit factor | 1,17 |
| Queda máxima da conta | cerca de 26% |
| Trades | 740 (cerca de 1 a cada 2 dias), com 34% de acerto |
| Long / Short | +36,8% / +33,3% |
| Liquidações | 0 (o pior trade custou 3,2% da conta) |

Por ano, em simulação com 1.990 USDT (cerca de R$ 10 mil):

| Ano | Resultado em USDT | Profit factor |
|---|---|---|
| 2022 | -25 (empate) | 0,97 |
| 2023 | +766 | 1,67 |
| 2024 | +177 | 1,10 |
| 2025 | +943 | 1,49 |
| 2026 (até set) | **-494** | 0,79 |

Fora da amostra (jan/2025 a set/2026, período não usado no desenvolvimento): **+20,1%**, com o mercado caindo 39,7%. Profit factor de 1,14 e queda máxima de 22,6%.

Como ler esses números:
- A taxa de acerto é baixa (cerca de 34%), mas os ganhos são maiores que as perdas. Isso é normal em estratégia de tendência. Haverá **sequências longas de stops**, e o bot não deve ser desligado no meio delas.
- 2026 está negativo até agora. Um mercado lateral é o pior cenário para essa estratégia.
- Resultado passado não garante resultado futuro.

### Pesquisa: o que foi testado e reprovado
Todas as versões foram desenvolvidas com dados de 2022 a 2024. Só as aprovadas foram validadas em 2025 e 2026.

| Teste | Resultado (2022 a 2024) | Decisão |
|---|---|---|
| Pullback em EMA 21/55, gráfico de 1h | -18,6% | Reprovado |
| Reversão à média (Bollinger + RSI, só sem tendência), 4h | -17,9%, profit factor 0,74 | Reprovado |
| Reversão à média, 1h | -65,7%, profit factor 0,60 | Reprovado |
| Filtro de regime do BTC nas altcoins | Profit factor de 1,22 para 1,26 (marginal) | Não adotado |
| Stop limitado a 10% e filtro de volatilidade | Mesmo lucro, zero liquidações | **Adotado** |

Conclusão: nesses pares, operar contra o movimento (reversão à média) perde dinheiro. A defesa contra mercado lateral é o tamanho de posição pequeno e as pausas automáticas.

### Limitações de uma conta de R$ 500
- A Binance exige um valor mínimo por ordem: 20 USDT para ETH e LINK, e 5 USDT para os demais pares. O BTC exige 0,001 BTC (cerca de 83 USDT), acima do limite de margem por trade com esse saldo, por isso ficou fora da lista.
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
docker compose logs -f freqtrade     # Ctrl+C sai dos logs; o bot continua rodando
```

5. No Telegram, envie `/start` e depois `/status`. O painel web fica em http://localhost:8080.
6. Opcional: para ver agora como fica o relatório semanal, rode `docker compose run --rm weekly-report --once`.

O computador precisa ficar ligado e conectado. Desative a suspensão automática. Se ele desligar, os stops continuam valendo na Binance, mas o bot não abre nem gerencia trades até voltar.

### 4. Ir para dinheiro real
1. Deixe rodar em **dry-run por pelo menos 1 a 2 semanas** e confira se as entradas, os stops e as mensagens chegam como esperado.
2. Mude para `FREQTRADE__DRY_RUN=false` no `.env` e ajuste `REPORT_STARTING_BALANCE` para o saldo real em USDT.
3. Rode `docker compose up -d` de novo.
4. Na Binance, confira se cada posição aberta tem uma ordem **Stop Market** correspondente.

O dry-run e o modo real usam o mesmo arquivo `user_data/tradesv3.sqlite`. Antes de ir para o real, apague esse arquivo (ou renomeie, se quiser guardar o histórico da simulação), para o relatório não misturar os dois.

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

## Relatório semanal no Telegram
O serviço `weekly-report` sobe junto com o bot e envia o relatório **toda segunda-feira às 9h (horário de Brasília)**. Ele traz:
- saldo realizado em USDT e em reais
- resultado dos últimos 7 dias e desde o início do acompanhamento
- taxa de acerto, profit factor, expectativa por trade, drawdown máximo, Sharpe e Sortino
- comparação com simplesmente comprar e segurar BTC no mesmo período
- alerta automático se o drawdown passar de 20%

Ele lê o banco do bot em modo somente leitura. Variáveis opcionais no `.env`: `REPORT_STARTING_BALANCE` e `REPORT_START_DATE`.

## Exportação para o IR

```bash
docker compose run --rm --entrypoint python freqtrade -m reporting.export_ir --year 2026
```

Gera `user_data/ir/ir_2026_trades.csv` (um trade por linha, convertido pela cotação USDT/BRL do dia do fechamento) e `user_data/ir/ir_2026_mensal.csv` (ganhos, perdas, taxas e resultado acumulado por mês). Os arquivos abrem direto no Excel. As regras de tributação de cripto mudam com frequência, por isso **confirme o enquadramento com um contador**.

## Servidor na nuvem (quando sair do computador)
1. **Onde:** VPS Linux no Brasil, por exemplo AWS Lightsail em São Paulo (`sa-east-1`, cerca de US$ 5 a 10 por mês) ou um provedor nacional. A Binance bloqueia IPs dos EUA, e um IP no país do seu cadastro evita bloqueios na conta. A estratégia é de 4h, então latência não importa.
2. **Instalar:** Ubuntu 24.04, depois `sudo apt install docker.io docker-compose-v2 git`. Clone o repositório em `/opt/trading-bot` e copie o seu `.env`.
3. **Chave de API:** atualize a whitelist de IP na Binance para o IP da VPS.
4. **Segurança:**
   - libere só a porta SSH (`sudo ufw allow OpenSSH && sudo ufw enable`)
   - acesse o painel por túnel, com `ssh -L 8080:localhost:8080 usuario@ip-da-vps`, sem abrir a porta 8080
   - use login por chave SSH
5. **Subir:** `docker compose up -d`. O `restart: unless-stopped` religa tudo após reboot.
6. **Backup diário** do banco de trades (pode rodar com o bot ligado), no `crontab -e`:

```bash
0 3 * * * cd /opt/trading-bot/trading-bot && python3 scripts/backup_db.py >> user_data/logs/backup.log 2>&1
```

7. **Atualizar:** `git pull && docker compose pull && docker compose up -d`.

## Desenvolvimento

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests
```

### Reproduzir o backtest

```bash
# No Brasil a API funciona normalmente:
freqtrade download-data -c user_data/config.json --userdir user_data --timeframes 1h 4h --timerange 20220101-
# Alternativa (servidores onde a API da Binance é bloqueada, como nos EUA):
python scripts/download_binance_vision.py --pairs ETH SOL BNB XRP DOGE LINK AVAX ADA --start 2022-01 --end 2026-09

freqtrade backtesting -c user_data/config.json --userdir user_data \
  --timerange 20220101- --timeframe-detail 1h --breakdown year
```

O arquivo `user_data/config.restricted-region.json` só serve para rodar backtests a partir de servidores onde a API da Binance está bloqueada (acrescente `-c user_data/config.restricted-region.json` ao comando). **Não use esse arquivo para operar.**

### Regras para mudar a estratégia
1. Desenvolva e ajuste usando só dados até 2024.
2. Valide uma única vez em 2025 e 2026. Se reprovar, não fique ajustando até passar, porque isso é overfitting.
3. Rode dry-run antes de colocar dinheiro.
4. Registre o resultado na tabela de pesquisa acima.
