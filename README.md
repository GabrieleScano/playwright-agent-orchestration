# Playwright Agent Orchestration

Prototipo didattico: dall'automazione classica con Playwright fino a un sistema di **agenti AI orchestrati**
che pianificano, generano, riparano (self-healing) e classificano (triage) i test end-to-end.

## Roadmap

- [x] **Passo 1** – Progetto Playwright + app demo (Mini Shop) con i primi test
- [x] **Passo 2** – Playwright MCP: un agente che pilota il browser
- [x] **Passo 3** – Test agents di Playwright: planner, generator, healer
- [x] **Passo 4** – Orchestratore multi-agente
- [x] **Passo 5** – Caccia ai test flaky
- [ ] **Passo 6** – CI, report e documentazione dell'architettura

## Avvio rapido

```bash
npm install
npx playwright install chromium
npm test              # avvia l'app demo e lancia i test
npm run demo          # solo l'app demo su http://localhost:3000
npx playwright show-report
npm run mcp:explore   # (con la demo avviata) parla con Playwright MCP come farebbe un agente
npm run chaos -- rename-button,price-bug && npm run orchestrate   # orchestratore multi-agente
npm run chaos -- slow-cart && npm run flaky                        # caccia ai test flaky
```

## Struttura

```
demo-app/            app da testare (HTML/JS statico + mini server Node)
tests/               test Playwright scritti a mano (la "baseline" umana)
agents/              script e agenti che usano Playwright MCP
.mcp.json            server MCP: playwright (browser) e playwright-test (test agents)
.claude/agents/      planner, generator, healer (generati da `npx playwright init-agents`)
specs/               piani di test scritti dal planner
orchestrator/        runner, engine LLM intercambiabile, triage, router, healer, report
chaos/               simula commit che rompono l'app (cambio di UI o bug vero)
docs/                spiegazione e risultati di ogni passo
playwright.config.ts config: avvia l'app con webServer, trace sui fallimenti
```

## Concetti

### Passo 2 – Playwright MCP
Un agente AI non importa Playwright: parla con un **server MCP** che espone *tool*
(`browser_navigate`, `browser_snapshot`, `browser_click`…) descritti da uno schema JSON.
Il ciclo è sempre **osserva → decidi → agisci**:

1. `browser_snapshot` restituisce l'accessibility tree in YAML con riferimenti `[ref=e7]`.
2. L'LLM sceglie l'elemento leggendo ruoli e nomi (`textbox "Email"`), non selettori CSS.
3. Chiama il tool con `target: "e7"`; il server risponde con il codice Playwright eseguito
   (`page.getByRole('textbox', { name: 'Email' }).fill(...)`).

`agents/mcp-explore.ts` esegue questo ciclo con decisioni scritte a mano, per vedere
esattamente cosa riceve l'agente. Gli errori dei tool tornano come testo: un LLM li legge e si corregge.

### Passo 3 – Test agents (planner, generator, healer)
Tre subagenti con ruoli separati: il **planner** esplora l'app e scrive un piano, il **generator**
esegue ogni scenario nel browser e lo trasforma in test, l'**healer** esegue i test rotti, li debugga e li ripara.
Abbiamo rotto l'app apposta (un bottone rinominato + un bug sul totale): l'healer ha riparato i locator
ma ha marcato come `fixme` i test che rilevavano il bug vero. Dettagli: [docs/passo-3.md](docs/passo-3.md).

### Passo 4 – Orchestratore multi-agente
Un loop in TypeScript coordina ruoli separati: **runner** (codice) → **triage** (un agente per test, in parallelo,
sola lettura, risposta JSON) → **router** (regole in codice) → **healer** (scrive solo in `tests/`) oppure
**bug report**. I guardrail finali impediscono di "riparare" un test che sta rilevando un bug.
Su un commit con un bottone rinominato e un bug nel totale, l'orchestratore ripara 4 test e segnala il bug
con il 97% di confidenza, lasciando rossi i 2 test giusti. Dettagli: [docs/passo-4.md](docs/passo-4.md).

### Passo 5 – Caccia ai test flaky
Ogni test gira 10 volte (statistica, niente LLM). Solo i test con risultati misti vanno all'agente
**flaky-analyst**, che cerca la causa radice (`test_timing` / `app_race` / `environment`). L'healer corregge
i problemi di timing con asserzioni web-first. Un guardrail sul diff blocca i "cerotti" (`waitForTimeout`,
retry, skip), e una verifica ×20 conferma la stabilità. Esempio reale: un test 9/10 diventa 20/20 con un diff di 2 righe.
Dettagli: [docs/passo-5.md](docs/passo-5.md).
