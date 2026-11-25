# language: it
Funzionalità: Catalogo prodotti
  Come cliente
  voglio vedere i prodotti disponibili con il loro prezzo
  per scegliere cosa acquistare partendo da un carrello vuoto

  Scenario: Il catalogo mostra i prodotti disponibili
    Dato che ho effettuato l'accesso
    Allora vedo la lista dei prodotti

  Schema dello scenario: Ogni prodotto mostra il suo prezzo
    Dato che ho effettuato l'accesso
    Allora vedo il prodotto "<prodotto>" al prezzo di "<prezzo>" €

    Esempi:
      | prodotto  | prezzo |
      | Tazza     | 8.50   |
      | Maglietta | 19.90  |
      | Quaderno  | 4.25   |

  Scenario: Il carrello parte vuoto
    Dato che ho effettuato l'accesso
    Allora il carrello contiene 0 articoli
    E il totale è "0.00" €

  Scenario: Senza accesso il catalogo non è visibile
    Dato che sono sulla pagina di accesso
    Allora non vedo la lista dei prodotti
