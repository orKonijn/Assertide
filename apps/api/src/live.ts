import type { Express } from "express";
import { z } from "zod";
import { IdentityService } from "./identity.ts";
import { PlatformService } from "./platform.ts";

export function mountLiveEvents(
  app: Express,
  identity: IdentityService,
  service: PlatformService,
) {
  app.get("/v1/runs/:id/events", async (req, res) => {
    const id = String(req.params["id"]);
    try {
      const principal = await identity.principal(req);
      if (!principal) {
        res.status(401).end();
        return;
      }
      await service.get(principal, id, "run");
    } catch {
      res.status(404).end();
      return;
    }
    const requested = req.get("Last-Event-ID") ?? "0";
    if (!/^\d+$/.test(requested) || !Number.isSafeInteger(Number(requested))) {
      res.status(400).end();
      return;
    }
    let cursor = Number(requested);
    let closed = false;
    let initial = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    const poll = async () => {
      try {
        const principal = await identity.principal(req);
        if (!principal) {
          res.write("event: access_revoked\ndata: {}\n\n");
          res.end();
          return;
        }
        await service.get(principal, id, "run");
        if (initial && cursor > 0) {
          const bounds = (
            await service.db.query<{
              minimum: string | null;
              maximum: string | null;
            }>(
              "SELECT min(sequence) AS minimum,max(sequence) AS maximum FROM run_events WHERE run_id=$1",
              [id],
            )
          ).rows[0];
          if (
            !bounds?.minimum ||
            cursor < Number(bounds.minimum) ||
            cursor > Number(bounds.maximum)
          ) {
            cursor = Number(bounds?.maximum ?? 0);
            res.write(
              `id: ${cursor}\nevent: resync\ndata: {"reason":"Replay window expired; reload snapshot"}\n\n`,
            );
          }
        }
        initial = false;
        const rows = (
          await service.db.query<{
            sequence: string;
            body: unknown;
            occurred_at: Date;
          }>(
            "SELECT sequence,body,occurred_at FROM run_events WHERE run_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 200",
            [id, cursor],
          )
        ).rows;
        for (const row of rows) {
          const sequence = z.coerce
            .number()
            .int()
            .positive()
            .parse(row.sequence);
          res.write(
            `id: ${sequence}\nevent: update\ndata: ${JSON.stringify({ runId: id, sequence, type: "snapshot_changed", schemaVersion: 1, occurredAt: row.occurred_at, payload: row.body })}\n\n`,
          );
          cursor = sequence;
        }
        if (!rows.length) res.write(": heartbeat\n\n");
      } catch {
        res.write("event: access_revoked\ndata: {}\n\n");
        res.end();
        return;
      }
      if (!closed) timer = setTimeout(() => void poll(), 1000);
    };
    req.once("close", () => {
      closed = true;
      clearTimeout(timer);
    });
    void poll();
  });
}
