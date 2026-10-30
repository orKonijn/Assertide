export const Routes = {
  overview: "/",
  projects: "/projects",
  suites: "/suites",
  explorer: "/explorer",
  runs: "/runs",
  reports: "/reports",
  api: "/api",
  settings: "/settings",
  run: (id: string) => `/runs/${id}`,
  result: (id: string, result: string) =>
    `/runs/${id}?result=${encodeURIComponent(result)}`,
} as const;
export const ApiRoutes = {
  me: "/v1/me",
  projects: "/v1/projects",
  logout: "/auth/logout",
  catalog: (id: string) => `/v1/projects/${id}/catalog`,
  metadata: (project: string, id: string) =>
    `/v1/projects/${project}/catalog/${id}`,
  suites: (id: string) => `/v1/projects/${id}/suites`,
  launch: (id: string) => `/v1/projects/${id}/runs`,
  run: (id: string) => `/v1/runs/${id}`,
  history: (id: string) => `/v1/runs/${id}/history`,
  rebuild: (id: string) => `/v1/runs/${id}/report-rebuilds`,
  report: (id: string) => `/v1/runs/${id}/report/index.html`,
  download: (id: string) => `/v1/runs/${id}/report-download`,
  artifact: (id: string, artifact: string) =>
    `/v1/runs/${id}/artifacts/${artifact}`,
  previous: (id: string, result: string) =>
    `/v1/runs/${id}/results/${result}/previous`,
  runs: (project: string) => `/v1/runs?projectId=${project}`,
} as const;
