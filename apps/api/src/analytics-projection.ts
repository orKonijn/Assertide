import type { SqlConnection } from "./database.ts";
import { migrate } from "./migrations.ts";

/** Transactional derived state: a terminal result and its analytics become visible together. */
export async function initializeAnalyticsProjection(db: SqlConnection) {
  await migrate(db, "analytics-instances-v1", [
    `CREATE TABLE analytics_instances (
      run_id text NOT NULL REFERENCES platform_documents(id) ON DELETE CASCADE,
      ordinal integer NOT NULL, organization_id uuid NOT NULL, project_id uuid NOT NULL,
      ended_at timestamptz NOT NULL, browser text, environment_id text NOT NULL,
      parameter_fingerprint text NOT NULL, eligible boolean NOT NULL,
      final_passed boolean NOT NULL, first_passed boolean NOT NULL, recovered boolean NOT NULL,
      result jsonb NOT NULL, PRIMARY KEY(run_id,ordinal)
    )`,
    "CREATE INDEX analytics_instances_scope ON analytics_instances(organization_id,project_id,ended_at)",
    `CREATE FUNCTION project_analytics_instances() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind <> 'run' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD.body->'results' IS NOT DISTINCT FROM NEW.body->'results'
        AND OLD.body->>'phase' IS NOT DISTINCT FROM NEW.body->>'phase'
        AND OLD.body->>'endedAt' IS NOT DISTINCT FROM NEW.body->>'endedAt'
        AND OLD.body->'config' IS NOT DISTINCT FROM NEW.body->'config' THEN RETURN NEW; END IF;
      DELETE FROM analytics_instances WHERE run_id=NEW.id;
      IF NEW.body->>'phase' = 'completed' AND NEW.body->>'endedAt' IS NOT NULL THEN
        INSERT INTO analytics_instances
        SELECT NEW.id, ord::integer, NEW.organization_id, NEW.project_id,
          (NEW.body->>'endedAt')::timestamptz, item->>'browser',
          COALESCE(NEW.body->'config'->>'environmentId','unknown'),
          COALESCE(item->>'parameterFingerprint','default'),
          NOT COALESCE((item->>'expectedFailure')::boolean,false)
            AND NOT COALESCE((item->>'quarantined')::boolean,false)
            AND item->>'status' IN ('passed','failed','broken','timedOut'),
          item->>'status'='passed',
          COALESCE(item->'attempts'->0->>'status'='passed',false),
          item->>'status'='passed' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(item->'attempts','[]'::jsonb)) WITH ORDINALITY a(value,attempt)
            WHERE attempt < jsonb_array_length(COALESCE(item->'attempts','[]'::jsonb)) AND value->>'status' IN ('failed','timedOut')),
          item
        FROM jsonb_array_elements(COALESCE(NEW.body->'results','[]'::jsonb)) WITH ORDINALITY r(item,ord);
      END IF;
      RETURN NEW;
    END $$`,
    "CREATE TRIGGER analytics_instances_changed AFTER INSERT OR UPDATE ON platform_documents FOR EACH ROW EXECUTE FUNCTION project_analytics_instances()",
    // Backfill existing finalized records without changing their authoritative bodies.
    `INSERT INTO analytics_instances
      SELECT p.id, ord::integer,p.organization_id,p.project_id,(p.body->>'endedAt')::timestamptz,
        item->>'browser',COALESCE(p.body->'config'->>'environmentId','unknown'),COALESCE(item->>'parameterFingerprint','default'),
        NOT COALESCE((item->>'expectedFailure')::boolean,false) AND NOT COALESCE((item->>'quarantined')::boolean,false) AND item->>'status' IN ('passed','failed','broken','timedOut'),
        item->>'status'='passed',COALESCE(item->'attempts'->0->>'status'='passed',false),
        item->>'status'='passed' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(item->'attempts','[]'::jsonb)) WITH ORDINALITY a(value,attempt) WHERE attempt < jsonb_array_length(COALESCE(item->'attempts','[]'::jsonb)) AND value->>'status' IN ('failed','timedOut')),item
      FROM platform_documents p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.body->'results','[]'::jsonb)) WITH ORDINALITY r(item,ord)
      WHERE p.kind='run' AND p.body->>'phase'='completed' AND p.body->>'endedAt' IS NOT NULL ON CONFLICT DO NOTHING`,
    `CREATE VIEW analytics_daily_utc AS SELECT organization_id,project_id,(ended_at AT TIME ZONE 'UTC')::date AS day,browser,environment_id,
      COUNT(*) FILTER(WHERE eligible) AS executed,
      COUNT(*) FILTER(WHERE eligible AND final_passed) AS passed,
      COUNT(*) FILTER(WHERE eligible AND first_passed) AS first_passed,
      COUNT(*) FILTER(WHERE eligible AND recovered) AS recovered
      FROM analytics_instances GROUP BY organization_id,project_id,(ended_at AT TIME ZONE 'UTC')::date,browser,environment_id`,
  ]);
}
