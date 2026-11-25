import type { Locator, Page } from '@playwright/test';

/**
 * Page object della schermata di accesso.
 *
 * Un page object espone ciò che l'UTENTE può fare ("accedi come…") e nasconde COME lo si fa
 * (quali locator, in che ordine). Se la UI cambia, si aggiorna solo questa classe.
 */
export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  static readonly DEFAULT_USER = { email: 'utente@example.com', password: 'segreta' };

  constructor(readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Entra' });
    this.error = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** Scorciatoia per i test che partono da "utente già entrato". */
  async loginAsDefaultUser() {
    await this.goto();
    await this.login(LoginPage.DEFAULT_USER.email, LoginPage.DEFAULT_USER.password);
  }
}
