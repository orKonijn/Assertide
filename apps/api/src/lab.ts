import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { Request, Response, Express, NextFunction } from "express";
import type { SqlConnection } from "./database.ts";

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const writable = z
  .object({
    sku: z.string().trim().min(1).max(100),
    quantity: z.number().int().min(1).max(10),
    status: z.enum(["draft", "confirmed"]),
  })
  .strict();
const orderSchema = writable.extend({
  id: z.uuid(),
  tenantId: z.uuid(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
});
type Order = z.infer<typeof orderSchema>;
interface Identity {
  subject: string;
  tenant: string;
  role: "operator" | "viewer";
}
interface StoredOrder extends Record<string, unknown> {
  body: Order;
}
interface KeyRow extends Record<string, unknown> {
  payload: string;
  body: Order;
}
export class LabError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class LabService {
  private readonly key: Uint8Array;
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(
    private readonly db: SqlConnection,
    private readonly password: string,
    signingKey: string,
  ) {
    if (signingKey.length < 32 || password.length < 12)
      throw new Error("Lab credentials are too short");
    this.key = new TextEncoder().encode(signingKey);
  }
  async initialize() {
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS lab_orders (id uuid PRIMARY KEY, tenant uuid NOT NULL, body jsonb NOT NULL)",
    );
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS lab_keys (scope text PRIMARY KEY, payload text NOT NULL, body jsonb NOT NULL)",
    );
  }
  async token(username: string, password: string): Promise<string> {
    if (
      !["operator-a", "viewer-a", "operator-b"].includes(username) ||
      password !== this.password
    )
      throw new LabError(401, "Invalid fixture credentials");
    return new SignJWT({
      tenant: username.endsWith("-b") ? tenantB : tenantA,
      role: username.startsWith("viewer") ? "viewer" : "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(username)
      .setIssuer("assertide-lab")
      .setAudience("assertide-lab-api")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(this.key);
  }
  async authenticate(header: string | undefined): Promise<Identity> {
    if (!header?.startsWith("Bearer "))
      throw new LabError(401, "Authentication required");
    try {
      const { payload } = await jwtVerify(header.slice(7), this.key, {
        issuer: "assertide-lab",
        audience: "assertide-lab-api",
        algorithms: ["HS256"],
      });
      const identity = z
        .object({
          sub: z.string(),
          tenant: z.uuid(),
          role: z.enum(["operator", "viewer"]),
        })
        .parse(payload);
      return {
        subject: identity.sub,
        tenant: identity.tenant,
        role: identity.role,
      };
    } catch {
      throw new LabError(401, "Invalid or expired token");
    }
  }
  private operator(identity: Identity) {
    if (identity.role !== "operator")
      throw new LabError(403, "Operator role required");
  }
  private parse(input: unknown, partial = false) {
    const result = (partial ? writable.partial() : writable).safeParse(input);
    if (!result.success)
      throw new LabError(
        422,
        result.error.issues
          .map((issue) => `/${issue.path.join("/")}: ${issue.message}`)
          .join("; "),
      );
    return result.data;
  }
  async get(identity: Identity, id: string): Promise<Order> {
    if (!z.uuid().safeParse(id).success)
      throw new LabError(404, "Order not found");
    const result = await this.db.query<StoredOrder>(
      "SELECT body FROM lab_orders WHERE id=$1 AND tenant=$2",
      [id, identity.tenant],
    );
    if (!result.rows[0]) throw new LabError(404, "Order not found");
    return orderSchema.parse(result.rows[0].body);
  }
  async list(identity: Identity, input: unknown) {
    const parsed = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(20),
        cursor: z.uuid().optional(),
        status: z.enum(["draft", "confirmed"]).optional(),
      })
      .safeParse(input);
    if (!parsed.success) throw new LabError(422, "Invalid list filters");
    const { limit, cursor, status } = parsed.data;
    const result = await this.db.query<StoredOrder>(
      "SELECT body FROM lab_orders WHERE tenant=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3::text IS NULL OR body->>'status'=$3) ORDER BY id LIMIT $4",
      [identity.tenant, cursor ?? null, status ?? null, limit + 1],
    );
    const items = result.rows
      .slice(0, limit)
      .map((row) => orderSchema.parse(row.body));
    return {
      items,
      nextCursor: result.rows.length > limit ? items.at(-1)?.id : null,
    };
  }
  async create(
    identity: Identity,
    input: unknown,
    key: string | undefined,
  ): Promise<Order> {
    this.operator(identity);
    if (!key || key.length > 200)
      throw new LabError(
        422,
        "Idempotency-Key required, maximum 200 characters",
      );
    const fields = this.parse(input);
    const payload = JSON.stringify(fields);
    const scope = `${identity.tenant}:${identity.subject}:${key}`;
    // Serialize same-key local requests; the unique database key arbitrates across processes.
    const previous = this.pending.get(scope);
    if (previous) await previous;
    const operation = this.createOnce(identity, scope, payload, fields);
    this.pending.set(scope, operation);
    try {
      return await operation;
    } finally {
      if (this.pending.get(scope) === operation) this.pending.delete(scope);
    }
  }
  private async createOnce(
    identity: Identity,
    scope: string,
    payload: string,
    fields: ReturnType<LabService["parse"]>,
  ): Promise<Order> {
    const order = orderSchema.parse({
      ...fields,
      id: randomUUID(),
      tenantId: identity.tenant,
      version: 1,
      createdAt: new Date().toISOString(),
    });
    // A single statement atomically records both the idempotency response and resource.
    const inserted = await this.db.query<KeyRow>(
      `WITH claimed AS (
      INSERT INTO lab_keys(scope,payload,body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING payload,body
    ), created AS (
      INSERT INTO lab_orders(id,tenant,body) SELECT $4,$5,body FROM claimed RETURNING id
    ) SELECT payload,body FROM claimed`,
      [scope, payload, JSON.stringify(order), order.id, identity.tenant],
    );
    const stored =
      inserted.rows[0] ??
      (
        await this.db.query<KeyRow>(
          "SELECT payload,body FROM lab_keys WHERE scope=$1",
          [scope],
        )
      ).rows[0];
    if (!stored) throw new Error("Idempotency response missing");
    if (stored.payload !== payload)
      throw new LabError(
        409,
        "Idempotency key already used with different input",
      );
    return orderSchema.parse(stored.body);
  }
  async update(
    identity: Identity,
    id: string,
    input: unknown,
    match: string | undefined,
    partial: boolean,
  ) {
    const existing = await this.get(identity, id);
    this.operator(identity);
    if (match !== `"${existing.version}"`)
      throw new LabError(412, "Stale or missing If-Match");
    const fields = this.parse(input, partial);
    const updated = { ...existing, ...fields, version: existing.version + 1 };
    const result = await this.db.query<StoredOrder>(
      "UPDATE lab_orders SET body=$1 WHERE id=$2 AND tenant=$3 AND (body->>'version')::int=$4 RETURNING body",
      [JSON.stringify(updated), id, identity.tenant, existing.version],
    );
    if (!result.rows[0]) throw new LabError(412, "Order changed concurrently");
    return orderSchema.parse(result.rows[0].body);
  }
  async remove(identity: Identity, id: string, match: string | undefined) {
    const existing = await this.get(identity, id);
    this.operator(identity);
    if (match !== `"${existing.version}"`)
      throw new LabError(412, "Stale or missing If-Match");
    if (existing.status === "confirmed")
      throw new LabError(409, "Confirmed orders cannot be deleted");
    const result = await this.db.query<StoredOrder>(
      "DELETE FROM lab_orders WHERE id=$1 AND tenant=$2 AND (body->>'version')::int=$3 RETURNING body",
      [id, identity.tenant, existing.version],
    );
    if (!result.rows[0]) throw new LabError(412, "Order changed concurrently");
  }
}

export function mountLab(app: Express, lab: LabService) {
  const route =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        await handler(req, res);
      } catch (error) {
        const status = error instanceof LabError ? error.status : 500;
        res
          .status(status)
          .type("application/problem+json")
          .json({
            type: "about:blank",
            title:
              status === 500 ? "Internal service error" : "Request rejected",
            status,
            detail:
              error instanceof LabError
                ? error.message
                : "Contact the service operator",
            correlationId: randomUUID(),
          });
      }
    };
  const body = (req: Request): unknown => {
    if (!req.is("application/json"))
      throw new LabError(415, "JSON content type required");
    return req.body as unknown;
  };
  const orderResponse = (res: Response, order: Order) => {
    res.set("ETag", `"${order.version}"`).json(order);
  };
  app.post(
    "/lab/v1/auth/token",
    route(async (req, res) => {
      const parsed = z
        .object({ username: z.string(), password: z.string() })
        .safeParse(body(req));
      if (!parsed.success)
        throw new LabError(401, "Invalid fixture credentials");
      res.json({
        access_token: await lab.token(
          parsed.data.username,
          parsed.data.password,
        ),
        token_type: "Bearer",
        expires_in: 300,
      });
    }),
  );
  app.get(
    "/lab/v1/orders",
    route(async (req, res) => {
      res.json(
        await lab.list(
          await lab.authenticate(req.get("Authorization")),
          req.query,
        ),
      );
    }),
  );
  app.post(
    "/lab/v1/orders",
    route(async (req, res) => {
      const order = await lab.create(
        await lab.authenticate(req.get("Authorization")),
        body(req),
        req.get("Idempotency-Key"),
      );
      res.status(201).set("Location", `/lab/v1/orders/${order.id}`);
      orderResponse(res, order);
    }),
  );
  app.get(
    "/lab/v1/orders/:id",
    route(async (req, res) => {
      orderResponse(
        res,
        await lab.get(
          await lab.authenticate(req.get("Authorization")),
          String(req.params["id"]),
        ),
      );
    }),
  );
  for (const method of ["put", "patch"] as const)
    app[method](
      "/lab/v1/orders/:id",
      route(async (req, res) => {
        orderResponse(
          res,
          await lab.update(
            await lab.authenticate(req.get("Authorization")),
            String(req.params["id"]),
            body(req),
            req.get("If-Match"),
            method === "patch",
          ),
        );
      }),
    );
  app.delete(
    "/lab/v1/orders/:id",
    route(async (req, res) => {
      await lab.remove(
        await lab.authenticate(req.get("Authorization")),
        String(req.params["id"]),
        req.get("If-Match"),
      );
      res.status(204).end();
    }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (error instanceof SyntaxError) {
        res
          .status(400)
          .type("application/problem+json")
          .json({
            type: "about:blank",
            title: "Malformed JSON",
            status: 400,
            correlationId: randomUUID(),
          });
        return;
      }
      next(error);
    },
  );
}
