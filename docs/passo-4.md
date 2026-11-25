# Passo 4 – L'orchestratore multi-agente

Nel Passo 3 un solo agente (l'healer) decideva tutto: cosa era rotto, se riparare e come.
Qui spezziamo quella decisione in **ruoli separati**, coordinati da codice TypeScript normale.

```
            ┌────────┐  fallimenti  ┌─────────────────────┐  verdetti JSON  ┌────────┐
     ┌────▶ │ runner │ ───────────▶ │ triage (1 agente per │ ─────────────▶ │ router │
     │      └────────┘              │ test, in parallelo)  │                └───┬────┘
     │                              └─────────────────────┘                    │
     │        ┌───────────────────────┬────────────────────────┬───────────────┤
     │        ▼                       ▼                        ▼               ▼
     │  broken_test → healer   app_bug → bug report   environment → riprova  unknown → persona
     │        │
     └────────┘   (loop: max 3 giri)
```

| Componente | È un LLM? | Permessi | File |
|---|---|---|---|
| Runner | No | esegue Playwright | `orchestrator/runner.ts` |
| Triage | Sì, N in parallelo | **sola lettura** (`Read`, `Glob`, `Grep`), niente `chaos/` | `.claude/agents/failure-triage.md` |
| Router | No | regole in codice | `orchestrator/index.ts` |
| Healer | Sì, 1 alla volta | scrive solo in `tests/` | `.claude/agents/playwright-test-healer.md` |
| Bug report | No | scrive in `reports/` | `orchestrator/index.ts` |
| Engine | — | interfaccia verso l'LLM | `orchestrator/engine.ts` |

## I concetti chiave

1. **Usa un LLM solo dove serve giudizio.** Eseguire i test, contare i fallimenti, scrivere un report:
   è codice deterministico, gratuito e ripetibile. L'LLM serve solo per *capire* un fallimento e per *riparare* un test.
2. **Output strutturato.** Il triage risponde con un JSON validato da uno schema
   (`category`, `confidence`, `summary`, `evidence`, `suggested_fix`). Così il router può decidere con un `if`,
   invece di interpretare testo libero.
3. **Fan-out per la lettura, serializzazione per la scrittura.** I triage sono indipendenti e in sola lettura,
   quindi girano in parallelo (`mapLimit`, max 3). L'healer modifica file: una sola istanza, con tutti i test insieme,
   per evitare due agenti che modificano lo stesso file.
4. **Il router è codice, non un prompt.** "Se `broken_test` e confidenza ≥ 70% allora healer" è una regola
   leggibile, testabile e uguale ogni volta. Sotto soglia, la decisione va a una persona.
5. **Permessi minimi per ruolo.** Il triage non può modificare niente. L'healer può modificare solo `tests/**`.
   Nessuno dei due può leggere `chaos/`, così giudicano "alla cieca" come in un caso reale.
6. **Guardrail sul risultato.** Alla fine l'orchestratore controlla che:
   - i test classificati come bug **restino rossi** (se diventano verdi, qualcuno ha nascosto il bug);
   - il numero di test **saltati** non sia aumentato (un `fixme` è un rosso nascosto);
   - non restino test rossi senza diagnosi.
7. **Engine intercambiabile.** L'orchestratore parla solo con l'interfaccia `AgentEngine`.
   Oggi c'è `ClaudeCodeEngine` (CLI `claude`, abbonamento). Per usare l'API o un altro modello basta
   un'altra classe con lo stesso metodo `run()`.

## L'esperimento: perché un loop

Con `npm run chaos -- rename-button,price-bug` simuliamo un commit che fa due cose:
rinomina il bottone "Entra" in "Login" (cambio legittimo) e introduce `Math.floor` nel totale (bug).

**Prima versione, un solo giro** ([report](esempi/run-1-un-solo-giro.md)): tutti e 5 i fallimenti sono stati
classificati `broken_test`. Il triage aveva ragione: i test si fermavano al login e non arrivavano mai
all'asserzione sul totale. **Il bug era nascosto da un altro fallimento.** L'healer ha riparato il login, ha visto il bug
e ha messo due test in `test.fixme`. Il risultato finale era "4 passati, 0 falliti", che sembrava tutto verde ma non lo era.

Due correzioni:
- l'healer non può più usare `fixme`/`skip`: decidere che un test rileva un bug è compito del triage;
- l'orchestratore diventa un **loop**: dopo ogni riparazione riesegue la suite e fa un nuovo triage dei nuovi fallimenti.

**Seconda versione, con il loop** ([report](esempi/run-2-loop.md)):

| Giro | Cosa succede |
|---|---|
| 1 | 5 rossi → triage: 5× `broken_test` (90–95%) → l'healer aggiorna il locator in 4 file |
| 2 | 2 rossi → triage: 2× `app_bug` (97–98%) → 2 [bug report](esempi/bug-report-esempio.md), test lasciati rossi |
| fine | 4 verdi, 2 rossi **per il motivo giusto**, nessun guardrail violato. ~100 s, ~0,22 $ di LLM |

## Provalo

```bash
npm run chaos -- rename-button,price-bug   # simula il commit "cattivo"
npm run orchestrate                        # guarda il loop nel terminale
cat reports/*/report.md                    # report e bug report
npm run chaos:reset && git checkout -- tests   # torna allo stato pulito
```

Richiede la CLI `claude` autenticata (Claude Code).
