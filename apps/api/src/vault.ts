import { readFile } from "node:fs/promises";
import { z } from "zod";

// Transit keeps durable ciphertext in our versioned database; Vault owns keys.
export class VaultTransit {
  private token = "";
  private expires = 0;
  private login: Promise<string> | undefined;
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  private async request(endpoint: string, body: unknown, token?: string) {
    const url = new URL(this.env["VAULT_ADDR"] ?? "");
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Invalid Vault address");
    if (
      url.protocol !== "https:" &&
      !(
        this.env["NODE_ENV"] === "test" &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    )
      throw new Error("Vault requires HTTPS");
    const response = await fetch(new URL(`/v1/${endpoint}`, url), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Vault-Token": token } : {}),
        ...(this.env["VAULT_NAMESPACE"]
          ? { "X-Vault-Namespace": this.env["VAULT_NAMESPACE"] }
          : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (response.status === 403) {
        this.token = "";
        this.expires = 0;
      }
      throw new Error("Vault operation failed");
    }
    return (await response.json()) as unknown;
  }
  private async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.expires) return this.token;
    if (this.login) return this.login;
    this.login = (async () => {
      const jwt = await readFile(
        this.env["VAULT_JWT_FILE"] ?? "/var/run/secrets/vault/token",
        "utf8",
      );
      const mount = z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .parse(this.env["VAULT_AUTH_MOUNT"] ?? "kubernetes");
      const role = z.string().min(1).parse(this.env["VAULT_ROLE"]);
      const result = z
        .object({
          auth: z.object({
            client_token: z.string().min(1),
            lease_duration: z.number().positive(),
          }),
        })
        .parse(
          await this.request(`auth/${mount}/login`, { role, jwt: jwt.trim() }),
        );
      this.token = result.auth.client_token;
      this.expires =
        Date.now() + Math.max(0, result.auth.lease_duration - 30) * 1000;
      return this.token;
    })();
    try {
      return await this.login;
    } finally {
      this.login = undefined;
    }
  }
  async transform(
    operation: "encrypt" | "decrypt",
    value: string,
    context: Buffer,
  ) {
    const mount = z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .parse(this.env["VAULT_TRANSIT_MOUNT"] ?? "transit");
    const key = z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .parse(this.env["VAULT_TRANSIT_KEY"] ?? "assertide");
    const token = await this.authenticate();
    const data = z
      .object({
        data: z.object({
          ciphertext: z.string().optional(),
          plaintext: z.string().optional(),
        }),
      })
      .parse(
        await this.request(
          `${mount}/${operation}/${key}`,
          {
            context: context.toString("base64"),
            ...(operation === "encrypt"
              ? { plaintext: Buffer.from(value).toString("base64") }
              : { ciphertext: value }),
          },
          token,
        ),
      ).data;
    if (operation === "encrypt")
      return z
        .string()
        .regex(/^vault:v\d+:/)
        .parse(data.ciphertext);
    return Buffer.from(z.string().parse(data.plaintext), "base64").toString(
      "utf8",
    );
  }
}
export const vaultTransit = new VaultTransit();
