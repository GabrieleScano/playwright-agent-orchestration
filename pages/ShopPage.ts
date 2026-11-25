import type { Locator, Page } from '@playwright/test';

/**
 * Il carrello è una parte della pagina negozio: un "component object" dentro il page object.
 * Così ShopPage resta piccola e il carrello si può riusare se un giorno avrà una pagina sua.
 */
export class CartPanel {
  readonly count: Locator;
  readonly total: Locator;
  readonly checkoutButton: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    this.count = page.getByTestId('cart-count');
    this.total = page.getByTestId('cart-total');
    this.checkoutButton = page.getByRole('button', { name: 'Vai al pagamento' });
    this.status = page.getByRole('status');
  }

  async checkout() {
    await this.checkoutButton.click();
  }
}

/** Page object della pagina con i prodotti e il carrello. */
export class ShopPage {
  readonly heading: Locator;
  readonly cart: CartPanel;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Prodotti' });
    this.cart = new CartPanel(page);
  }

  addButton(product: string): Locator {
    return this.page.getByRole('button', { name: `Aggiungi ${product}` });
  }

  productRow(product: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: product });
  }

  welcome(text: string): Locator {
    return this.page.getByText(text);
  }

  async add(product: string, times = 1) {
    for (let i = 0; i < times; i++) await this.addButton(product).click();
  }
}
