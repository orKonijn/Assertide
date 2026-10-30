export const ProjectsSelectors = {
  name: 'Project name',
  description: 'Description',
  create: 'Create project',
  save: 'Save project',
  section: 'section',
  edit: (name: string) => `Edit ${name}`,
} as const;
