# Playwright Agent Orchestration

[![E2E](https://github.com/GabrieleScano/playwright-agent-orchestration/actions/workflows/e2e.yml/badge.svg)](https://github.com/GabrieleScano/playwright-agent-orchestration/actions/workflows/e2e.yml)

Un prototipo di **framework di test interno basato su agenti AI**, costruito sopra Playwright.
Quando i test end-to-end falliscono, un orchestratore TypeScript coordina agenti con ruoli separati che
**classificano** il fallimento (test fragile, bug dell'app o ambiente), **riparano** i test fragili, **segnalano**
i bug veri e **scovano** i test flaky. Gli scenari sono scritti in **BDD (Gherkin in italiano)**: gli agenti possono
riparare le step definitions ma mai i requisiti, e i locator vivono solo nei **page object** (una riga ripara tutti i test). Tutto con guardrail in codice e un tetto di spesa per esecuzione.

> Progetto di apprendimento costruito passo per passo: ogni passo ha la sua spiegazione in [`docs/`](docs/).

## Architettura

```
                         ┌──────────────── GitHub Actions ────────────────┐
  push / PR ──▶ Playwright test ──verde──▶ fine (0 token)                  │
                         │                                                 │
                       rosso                                               │
                         ▼                                                 │
  ┌──────────────────── orchestrator/index.ts (loop, max 3 giri) ───────────────────┐
  │ runner (codice) ─▶ triage ×N (agente, haiku, sola lettura, JSON) ─▶ router (codice) │
  │        ▲                                                         │               │
  │        │          broken_test ─▶ healer (agente, sonnet, solo tests/)            │
  │        └───────── app_bug     ─▶ bug report (codice), il test resta rosso        │
  │                   unknown     ─▶ persona                                         │
  │ guardrail: bug ancora rossi · niente skip · budget $ · max fallimenti            │
  └──────────────────────────────────────────────────────────────────────────────────┘
  notte / a mano ──▶ orchestrator/flaky.ts: runner ×10 ─▶ flaky-analyst ─▶ healer ─▶ verifica ×20
  nuovo requisito ─▶ orchestrator/bdd.ts:  bdd-planner (.feature) ─▶ bddgen ─▶ bdd-generator (steps) ─▶ runner
```

| Ruolo | Tipo | Modello | Permessi |
|---|---|---|---|
| Runner | codice | — | esegue Playwright |
| `failure-triage` | agente | haiku | sola lettura, output JSON |
| `flaky-analyst` | agente | haiku | sola lettura, output JSON |
| Router e guardrail | codice | — | — |
| `playwright-test-healer` | agente | sonnet | modifica solo `pages/**`, `tests/**` e `features/steps/**`, **mai** i `.feature` |
| `bdd-planner` | agente | sonnet | scrive solo `.feature` nuovi, in italiano |
| `bdd-generator` | agente | sonnet | scrive solo in `features/steps/**` e `pages/**` |

## Risultati misurati

| Scenario | Cosa succede | Costo |
|---|---|---|
| Commit che rinomina un bottone **e** introduce un bug nel totale | Giro 1: locator aggiornato in 6 test. Giro 2: 2 `app_bug` al 97%, con bug report sulla riga esatta. Test giusti lasciati rossi | **$0.078** ([report](docs/esempi/run-3-budget-haiku.md)) |
| Stesso commit, suite in BDD | Healer: **1 riga** nello step condiviso (`ui.loginButton`) e 6 scenari verdi. 3 `app_bug` sul totale restano rossi, nessun `.feature` toccato | **$0.121** ([report](docs/esempi/run-bdd.md)) |
| Stesso commit, con Page Object Model (15 test) | Healer: **1 riga** in `pages/LoginPage.ts`, 10 test verdi (BDD e classici). 3 `app_bug` restano rossi | **$0.152** ([report](docs/esempi/run-pom.md)) |
| Carrello reso asincrono, test che legge `textContent()` senza aspettare | Rilevato flaky (9/10), diagnosi `test_timing` 95%, fix di 2 righe, verificato 20/20 | **$0.06** ([report](docs/esempi/flaky-run.md)) |
| Più di 10 test rossi (app giù, deploy rotto) | Interruttore di sicurezza: nessun agente, report con i primi errori | **$0** |
| Pipeline verde | Nessun agente chiamato | **$0** |

## Come si tengono bassi i costi

- **Gli agenti partono solo sul rosso.** Pipeline verde = zero token.
- **L'LLM solo dove serve giudizio.** Eseguire test, contare i flaky, scegliere chi interviene e scrivere i report è codice.
- **Il modello giusto per il ruolo.** Il triage è una classificazione e usa `haiku`. L'healer modifica codice e usa `sonnet`.
  Passare il triage da sonnet a haiku ha portato lo stesso scenario da $0.22 a $0.078, con le stesse diagnosi.
- **Tetti rigidi:** `AGENT_BUDGET_USD` (budget per esecuzione, applicato anche alla singola chiamata),
  `MAX_FAILURES` (oltre, niente agenti), massimo 3 giri.
- **Il lavoro pesante si fa di notte.** La caccia ai flaky gira con `schedule` o a mano. Senza API key gira solo la parte statistica, gratis.
- **Costi nel report.** Ogni report ha la tabella dei costi per agente e modello.

## Avvio rapido

```bash
npm install
npx playwright install chromium
npm test                                   # bddgen + test Playwright (avvia l'app demo da solo)
npm run test:ui                            # UI mode, con anche gli scenari BDD

# richiedono la CLI `claude` (Claude Code) autenticata
npm run chaos -- rename-button,price-bug   # simula un commit "cattivo"
npm run orchestrate                        # triage + self-healing + bug report
npm run chaos:reset && git checkout -- pages tests features

npm run bdd -- "il catalogo dei prodotti"  # planner scrive il .feature, generator gli step mancanti

npm run chaos -- slow-cart
npm run flaky                              # AGENTS=off npm run flaky → solo statistica
```

Variabili: `AGENT_BUDGET_USD` (default 1), `TRIAGE_MODEL` (haiku), `HEAL_MODEL` (sonnet), `MAX_FAILURES` (10), `REPEAT` (10).

### Se i test non partono
- **Porta occupata:** l'app demo gira su `http://localhost:4310`. Se la porta è già in uso, Playwright si ferma con
  `http://localhost:4310 is already used`. Chiudi l'altro processo, oppure scegli un'altra porta: `PORT=5000 npx playwright test --ui`
  (su Windows PowerShell: `$env:PORT=5000; npx playwright test --ui`).
- **Node:** serve almeno la versione 20.11 (consigliata la 22).
- **Browser mancante:** `npx playwright install chromium`.
- **macOS 13 o precedenti:** Playwright non scarica più il suo Chromium (`Playwright does not support chromium on mac13`).
  Il progetto se ne accorge da solo e usa il **Google Chrome installato** sul Mac: basta avere Chrome e saltare `npx playwright install`.
  Per forzare un browser di sistema ovunque: `PW_CHANNEL=chrome npx playwright test` (oppure `msedge`).

### In CI
Il workflow [`e2e.yml`](.github/workflows/e2e.yml) esegue i test a ogni push e PR. Se falliscono e il secret
`ANTHROPIC_API_KEY` è configurato, lancia l'orchestratore con budget $0.50 e pubblica il report nel riepilogo del job.
Le correzioni dell'healer sono un artifact (`healer.patch`) e **non vengono mai committate da sole**.
Con *Run workflow* si può scegliere una mutazione `chaos` per una demo dal vivo.

## Il percorso

| Passo | Argomento | Concetto chiave |
|---|---|---|
| 1 | Progetto Playwright + app demo | locator basati sull'accessibilità |
| 2 | [Playwright MCP](agents/mcp-explore.ts) | un agente "vede" la pagina come accessibility tree e agisce tramite tool |
| 3 | [Test agents](docs/passo-3.md): planner, generator, healer | ruoli separati, permessi separati |
| 4 | [Orchestratore](docs/passo-4.md) | output strutturato, router in codice, loop, guardrail |
| 5 | [Test flaky](docs/passo-5.md) | statistica prima dell'AI, niente cerotti |
| 6 | [CI e costi](docs/passo-6.md) | budget, modello per ruolo, agenti solo sul rosso |
| 7 | [BDD con playwright-bdd](docs/passo-7.md) | il requisito (`.feature`) è di una persona, gli step possono essere dell'agente |
| 8 | [Page Object Model](docs/passo-8.md) | un locator, un posto: riparazioni da una riga, condivise da test classici e BDD |

## Struttura

```
demo-app/            app da testare (HTML/JS statico + mini server Node)
features/            scenari BDD in Gherkin italiano (*.feature) + step definitions (steps/)
pages/               page object (LoginPage, ShopPage) + fixture condivise da test e step
tests/               test Playwright classici
orchestrator/        engine LLM intercambiabile + budget, runner, triage/router/healer, flaky, bdd
.claude/agents/      definizioni degli agenti (ruolo + tool consentiti)
chaos/               simula commit che rompono l'app
agents/              esplorazione didattica di Playwright MCP
docs/                spiegazione di ogni passo + report di esempio
.github/workflows/   pipeline CI
```
