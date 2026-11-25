# language: it
Funzionalità: Accesso al Mini Shop
  Come cliente
  voglio accedere con email e password
  per poter fare acquisti

  Contesto:
    Dato che sono sulla pagina di accesso

  Scenario: Accesso con credenziali valide
    Quando accedo come "utente@example.com" con password "segreta"
    Allora vedo la lista dei prodotti
    E vedo il messaggio di benvenuto "Ciao, utente@example.com"

  Scenario: Accesso rifiutato con password errata
    Quando accedo come "utente@example.com" con password "sbagliata"
    Allora vedo l'errore "Credenziali non valide"
    E non vedo la lista dei prodotti
