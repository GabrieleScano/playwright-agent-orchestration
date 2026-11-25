# language: it
Funzionalità: Pagamento
  Come cliente
  voglio concludere l'ordine
  e sapere subito se è andato a buon fine

  Contesto:
    Dato che ho effettuato l'accesso

  Scenario: Pagamento con carrello vuoto
    Quando vado al pagamento
    Allora vedo lo stato "Il carrello è vuoto"

  Scenario: Ordine confermato
    Quando aggiungo "Tazza" al carrello
    E vado al pagamento
    Allora vedo lo stato "Ordine confermato!"
