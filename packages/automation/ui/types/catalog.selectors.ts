export const CatalogSelectors = {
  heading: "Test explorer",
  cases: "input[type=checkbox]",
  search: "Search tests",
  module: "Module",
  owner: "Test owner",
  quarantined: "Quarantine future results (exclude from headline metrics)",
  enabled: "Enabled for future selections",
  save: "Save test metadata",
  environment: "Environment",
  start: "Start execution",
  select: (id: string) => `Select ${id}`,
  edit: (id: string) => `Edit ${id}`,
} as const;
