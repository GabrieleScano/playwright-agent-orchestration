# Playwright Agent Orchestration

Prototipo didattico: dall'automazione classica con Playwright fino a un sistema di **agenti AI orchestrati**
che pianificano, generano, riparano (self-healing) e classificano (triage) i test end-to-end.

## Roadmap

- [x] **Passo 1** – Progetto Playwright + app demo (Mini Shop) con i primi test
- [x] **Passo 2** – Playwright MCP: un agente che pilota il browser
- [x] **Passo 3** – Test agents di Playwright: planner, generator, healer
- [ ] **Passo 4** – Orchestratore multi-agente
- [ ] **Passo 5** – Self-healing e triage dei fallimenti
- [ ] **Passo 6** – CI, report e documentazione dell'architettura

## Avvio rapido

```bash
npm install
npx playwright install chromium
npm test              # avvia l'app demo e lancia i test
npm run demo          # solo l'app demo su http://localhost:3000
npx playwright show-report
npm run mcp:explore   # (con la demo avviata) parla con Playwright MCP come farebbe un agente
```

## Struttura

```
demo-app/            app da testare (HTML/JS statico + mini server Node)
tests/               test Playwright scritti a mano (la "baseline" umana)
agents/              script e agenti che usano Playwright MCP
.mcp.json            server MCP: playwright (browser) e playwright-test (test agents)
.claude/agents/      planner, generator, healer (generati da `npx playwright init-agents`)
specs/               piani di test scritti dal planner
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
