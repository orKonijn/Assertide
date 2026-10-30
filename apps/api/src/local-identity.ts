import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import Provider from "oidc-provider";

export async function startLocalIdentity(
  password: string,
  clientSecret: string,
  callback: string,
) {
  if (process.env["NODE_ENV"] === "production")
    throw new Error("Local identity fixture is forbidden in production");
  const issuer = "http://127.0.0.1:4011";
  const provider = new Provider(issuer, {
    clients: [
      {
        client_id: "assertide-local",
        client_secret: clientSecret,
        redirect_uris: [callback],
        response_types: ["code"],
        grant_types: ["authorization_code"],
      },
    ],
    cookies: { keys: [randomBytes(32).toString("hex")] },
    features: { devInteractions: { enabled: false } },
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, id) => ({
      accountId: id,
      claims: async () => ({ sub: id, name: id }),
    }),
  });
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.get("/interaction/:uid", async (req, res) => {
    try {
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name === "consent") {
        const grant = new provider.Grant({
          accountId: details.session?.accountId,
          clientId: "assertide-local",
        });
        grant.addOIDCScope("openid profile");
        await provider.interactionFinished(
          req,
          res,
          { consent: { grantId: await grant.save() } },
          { mergeWithLastSubmission: true },
        );
        return;
      }
      res.set(
        "Content-Security-Policy",
        `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(callback).origin}; frame-ancestors 'none'`,
      );
      res.send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assertide local sign in</title><style>body{font:16px system-ui,sans-serif;background:#f5f6fa;color:#182237;margin:0;padding:24px}main{max-width:420px;margin:8vh auto;background:white;padding:28px;border:1px solid #d8dfea;border-radius:16px}h1{font-size:26px;line-height:1.2}p{line-height:1.6;color:#58657b}label{display:block;font-weight:600;margin:20px 0}input,select,button{font:inherit;box-sizing:border-box;min-height:44px;border:1px solid #58657b;border-radius:8px;padding:10px;width:100%;margin-top:8px}button{background:#5145cd;color:white;font-weight:600;cursor:pointer}:focus-visible{outline:3px solid #5145cd;outline-offset:3px}</style><main><h1>Assertide local sign in</h1><p>Choose an account for your local workspace.</p><form method="post"><label>Account <select name="account"><option>admin</option><option>operator</option><option>viewer</option></select></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form><p>Development identity provider</p></main></html>',
      );
    } catch {
      res
        .status(400)
        .send("Login session expired. Return to Assertide and try again.");
    }
  });
  app.post("/interaction/:uid", async (req, res) => {
    if (req.get("Origin") !== issuer) {
      res.status(403).end();
      return;
    }
    const input: unknown = req.body;
    if (
      !input ||
      typeof input !== "object" ||
      !("password" in input) ||
      typeof input.password !== "string" ||
      !("account" in input) ||
      !["admin", "operator", "viewer"].includes(String(input.account))
    ) {
      res.status(401).end();
      return;
    }
    const supplied = Buffer.from(input.password);
    const expected = Buffer.from(password);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.status(401).send("Incorrect credentials");
      return;
    }
    try {
      await provider.interactionDetails(req, res);
      await provider.interactionFinished(
        req,
        res,
        { login: { accountId: String(input.account) } },
        { mergeWithLastSubmission: false },
      );
    } catch {
      res.status(400).send("Login session expired");
    }
  });
  app.use(provider.callback());
  const server = app.listen(4011, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}
