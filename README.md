# Playwright Agent Orchestration

Prototipo didattico: dall'automazione classica con Playwright fino a un sistema di **agenti AI orchestrati**
che pianificano, generano, riparano (self-healing) e classificano (triage) i test end-to-end.

## Roadmap

- [x] **Passo 1** – Progetto Playwright + app demo (Mini Shop) con i primi test
- [ ] **Passo 2** – Playwright MCP: un agente che pilota il browser
- [ ] **Passo 3** – Test agents di Playwright: planner, generator, healer
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
```

## Struttura

```
demo-app/            app da testare (HTML/JS statico + mini server Node)
tests/               test Playwright scritti a mano (la "baseline" umana)
playwright.config.ts config: avvia l'app con webServer, trace sui fallimenti
```
