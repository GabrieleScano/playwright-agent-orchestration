# Piano di test Mini Shop

## Application Overview

Mini Shop è una piccola app single-page (http://localhost:3000) con login simulato (qualsiasi email valida + password "segreta"), elenco di 3 prodotti (Tazza 8.50 €, Maglietta 19.90 €, Quaderno 4.25 €), carrello (contatore e totale) e pulsante "Vai al pagamento". Non esiste rimozione dal carrello e lo stato è solo in memoria (si perde al ricaricamento). Il piano copre login, carrello e checkout con casi negativi, in 8 scenari indipendenti. Ogni scenario parte da stato fresco (pagina di login appena caricata).

## Test Scenarios

### 1. Login

**Seed:** `tests/seed.spec.ts`

#### 1.1. Login riuscito con credenziali valide

**File:** `tests/login/login-valido.spec.ts`

**Steps:**
  1. Aprire http://localhost:3000/ (stato fresco dal seed)
    - expect: Si vede l'intestazione 'Mini Shop' con i campi Email, Password e il pulsante 'Accedi'
    - expect: La vista prodotti non è visibile
  2. Inserire l'email 'utente@example.com' e la password 'segreta', poi cliccare 'Accedi'
    - expect: Il form di login scompare
    - expect: Compare l'intestazione 'Prodotti'
    - expect: Il messaggio di benvenuto è 'Ciao, utente@example.com'
    - expect: Articoli: 0 e Totale: 0.00 €

#### 1.2. Login rifiutato con password errata

**File:** `tests/login/login-password-errata.spec.ts`

**Steps:**
  1. Inserire email 'utente@example.com' e password 'sbagliata', cliccare 'Accedi'
    - expect: Compare l'alert 'Credenziali non valide'
    - expect: Si resta nella vista di login; i prodotti non sono visibili
  2. Correggere la password con 'segreta' e cliccare di nuovo 'Accedi'
    - expect: Il login riesce e compare la vista 'Prodotti' con 'Ciao, utente@example.com'

#### 1.3. Validazione campi vuoti e email non valida

**File:** `tests/login/login-validazione.spec.ts`

**Steps:**
  1. Cliccare 'Accedi' con entrambi i campi vuoti
    - expect: Il browser blocca l'invio (validazione HTML 'required'); nessuna navigazione alla vista prodotti
    - expect: Il messaggio 'Credenziali non valide' non compare (la validazione è del browser, non dell'app)
  2. Inserire email 'non-una-email' e password 'segreta', cliccare 'Accedi'
    - expect: L'invio è bloccato dalla validazione type=email; si resta nel login
  3. Inserire email valida e lasciare vuota la password, cliccare 'Accedi'
    - expect: L'invio è bloccato; si resta nel login

### 2. Carrello

**Seed:** `tests/seed.spec.ts`

#### 2.1. Aggiunta di prodotti e calcolo di contatore e totale

**File:** `tests/cart/aggiunta-prodotti.spec.ts`

**Steps:**
  1. Effettuare il login con credenziali valide
    - expect: Sono elencati Tazza 8.50 €, Maglietta 19.90 €, Quaderno 4.25 € con i relativi pulsanti 'Aggiungi ...'
  2. Cliccare 'Aggiungi Tazza'
    - expect: Articoli: 1, Totale: 8.50
  3. Cliccare 'Aggiungi Maglietta' e poi 'Aggiungi Quaderno'
    - expect: Articoli: 3, Totale: 32.65

#### 2.2. Aggiunta dello stesso prodotto più volte

**File:** `tests/cart/prodotto-ripetuto.spec.ts`

**Steps:**
  1. Effettuare il login e cliccare 'Aggiungi Quaderno' 3 volte
    - expect: Articoli: 3
    - expect: Totale: 12.75 (precisione a due decimali, nessun errore di arrotondamento)
  2. Cliccare 'Aggiungi Maglietta' 2 volte aggiuntive
    - expect: Articoli: 5, Totale: 52.55

#### 2.3. Il carrello si azzera al ricaricamento e richiede nuovo login

**File:** `tests/cart/ricarica-pagina.spec.ts`

**Steps:**
  1. Effettuare il login, aggiungere una Tazza
    - expect: Articoli: 1, Totale: 8.50
  2. Ricaricare la pagina
    - expect: Si torna alla vista di login (nessuna sessione persistente)
    - expect: Dopo un nuovo login il carrello mostra Articoli: 0 e Totale: 0.00

### 3. Checkout

**Seed:** `tests/seed.spec.ts`

#### 3.1. Checkout con carrello pieno conferma l'ordine

**File:** `tests/checkout/checkout-ok.spec.ts`

**Steps:**
  1. Effettuare il login, aggiungere Tazza e Maglietta, cliccare 'Vai al pagamento'
    - expect: Compare il messaggio di stato 'Ordine confermato!'
    - expect: Il messaggio 'Il carrello è vuoto' non è presente

#### 3.2. Checkout con carrello vuoto è rifiutato

**File:** `tests/checkout/checkout-carrello-vuoto.spec.ts`

**Steps:**
  1. Effettuare il login e, senza aggiungere prodotti, cliccare 'Vai al pagamento'
    - expect: Compare il messaggio di stato 'Il carrello è vuoto'
    - expect: Non compare 'Ordine confermato!'; contatore 0 e totale 0.00 invariati
  2. Aggiungere una Tazza e cliccare di nuovo 'Vai al pagamento'
    - expect: Il messaggio cambia in 'Ordine confermato!'
