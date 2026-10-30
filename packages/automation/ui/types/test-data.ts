export const TestData = {
  origin: "http://127.0.0.1:4200",
  reportOrigin: "http://localhost:4012",
  project: "00000000-0000-4000-8000-000000000010",
  environment: "local-lab",
  lifecycle: "LAB-001",
  unauthorized: "LAB-002",
  forbidden: "LAB-003",
  latency: "LAB-014",
  login: "UI-001",
  checkout: "UI-005",
  product: "UI-011",
  apiIds: Array.from(
    { length: 15 },
    (_, i) => `LAB-${String(i + 1).padStart(3, "0")}`,
  ),
  uiIds: Array.from(
    { length: 12 },
    (_, i) => `UI-${String(i + 1).padStart(3, "0")}`,
  ),
  smokeIds: ["LAB-001", "UI-001", "UI-005", "UI-011"],
  historyIds: ["LAB-002", "LAB-003"],
} as const;
export const Timeouts = {
  execution: 60000,
  report: 30000,
  toast: 7000,
  cancellation: 15000,
  practice: 15000,
} as const;
export const RunStatus = {
  completed: "completed",
  canceled: "canceled",
  passed: "passed",
  ready: "ready",
} as const;
export const Viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 844 },
  mobile: { width: 390, height: 844 },
} as const;
