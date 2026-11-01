export interface CreatorProfile {
  readonly name?: string;
  readonly title: string;
  readonly introduction: string;
  readonly motivation: string;
  readonly contribution: string;
  readonly focus: readonly string[];
  readonly freelance: { readonly period: string; readonly companies: readonly string[] };
  readonly links: readonly { readonly label: string; readonly href: string }[];
  readonly portrait?: { readonly src: string; readonly alt: string };
}

export const creator: CreatorProfile = {
  name: 'Or Konijn',
  title: 'Independent freelancer',
  introduction:
    'I build website-testing tools for companies. Assertide is an example of the tools I create, bringing test selection, execution, and investigation into one workspace.',
  motivation:
    'I built this project to demonstrate how companies can use a dedicated tool to test their websites and work with the results.',
  contribution:
    'Assertide is my demonstration project for company-focused testing tools. It shows the product workflow alongside the automation and engineering behind it.',
  focus: ['Website testing tools', 'Company testing workflows', 'Test automation'],
  freelance: {
    period: 'July–November 2026',
    companies: ['Elevation Aquaculture', 'Global Expansion Solutions', 'Merkazim.info'],
  },
  links: [],
};

export const lifecycle = [
  [
    'Select',
    'Choose catalog tests or a saved suite. The run keeps a frozen selection and source revision.',
  ],
  [
    'Configure',
    'Choose the permitted environment, browser, workers, and retry settings. API-only tests do not launch a browser.',
  ],
  [
    'Queue',
    'The API validates access and configuration, records the run, and schedules execution.',
  ],
  [
    'Execute',
    'A supervisor starts the approved test workload. Runtime and environment policy determine how it runs.',
  ],
  [
    'Follow',
    'Persisted events stream progress to the UI. Logs and attempt results support investigation.',
  ],
  [
    'Preserve',
    'Results and available evidence are stored. Retry attempts remain visible alongside the final outcome.',
  ],
  [
    'Report',
    'Allure generation has its own readiness state. A completed execution does not necessarily mean its report is ready.',
  ],
  [
    'Investigate',
    'Review attempts and artifacts, inspect recorded API exchanges, or start a linked rerun.',
  ],
] as const;
