export interface CatalogCase {
  id: string;
  title: string;
  kind: string;
  enabled: boolean;
  version: number;
  feature: string;
  module: string;
  owner: string;
  priority: string;
  tags: string[];
  quarantined?: boolean;
}
export interface Project {
  id: string;
  name: string;
}
export interface RunRecord {
  id: string;
  phase: string;
  reportPhase: string;
  reportDirectory?: string;
  projectId: string;
  logTail?: string;
  parentRunId?: string;
  selection: { testIds: string[] };
  source: { revision: string };
  environment: { passwordRef: { version: number } };
  historyStream?: string;
  historyEntries: number;
  historyVersion: number;
  rawArchive?: unknown;
  toolchain: { playwright: string };
  results: {
    id: string;
    caseId?: string;
    status: string;
    attempts: { steps: unknown[] }[];
  }[];
  artifacts: { id: string; name: string }[];
}
export interface SuiteInput {
  name: string;
  description?: string;
  owner?: string;
  tags?: string[];
  testIds: readonly string[];
}
