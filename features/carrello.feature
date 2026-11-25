# language: it
Funzionalità: Carrello
  Come cliente
  voglio vedere quanti articoli ho scelto e quanto spendo
  per decidere se procedere all'acquisto

  Contesto:
    Dato che ho effettuato l'accesso

  Scenario: Prodotti diversi
    Quando aggiungo "Tazza" al carrello
    E aggiungo "Quaderno" al carrello
    Allora il carrello contiene 2 articoli
    E il totale è "12.75" €

  Schema dello scenario: Stesso prodotto più volte
    Quando aggiungo <quantità> volte "<prodotto>" al carrello
    Allora il carrello contiene <quantità> articoli
    E il totale è "<totale>" €

    Esempi:
      | prodotto  | quantità | totale |
      | Quaderno  | 3        | 12.75  |
      | Maglietta | 2        | 39.80  |
