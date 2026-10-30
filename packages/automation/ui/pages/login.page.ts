import type { Page } from "@playwright/test";
import { AuthenticationSelectors as S } from "../types/authentication.selectors";
import { Routes } from "../types/routes";
import { workflow, registerSecret } from "../utils/allure.utils";
export class LoginPage {
  readonly signInLink;
  readonly password;
  readonly account;
  constructor(readonly page: Page) {
    this.signInLink = page.getByRole("link", { name: S.sso });
    this.password = page.getByLabel(S.password, { exact: true });
    this.account = page.getByRole("combobox", { name: S.account, exact: true });
  }
  goto(route: string = Routes.overview) {
    return workflow("Open sign-in entry", () => this.page.goto(route));
  }
  openSso() {
    return workflow("Continue to single sign-on", () =>
      this.signInLink.click(),
    );
  }
  signIn(password: string, account = "admin") {
    return workflow(`Sign in as ${account}`, async () => {
      await this.account.selectOption(account);
      registerSecret(password);
      await this.password.fill(password);
      await this.page
        .getByRole("button", { name: S.signIn, exact: true })
        .click();
    });
  }
  async login(
    password: string,
    account = "admin",
    route: string = Routes.overview,
  ) {
    await this.goto(route);
    await this.openSso();
    await this.signIn(password, account);
  }
  signOut() {
    return workflow("Sign out of Assertide", () =>
      this.page.getByRole("button", { name: S.signOut, exact: true }).click(),
    );
  }
}
