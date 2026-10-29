import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/overview').then((m) => m.Overview) },
  { path: 'explorer', loadComponent: () => import('./pages/explorer').then((m) => m.Explorer) },
  { path: 'api', loadComponent: () => import('./pages/explorer').then((m) => m.Explorer) },
  { path: 'runs', loadComponent: () => import('./pages/runs').then((m) => m.Runs) },
  { path: 'runs/:id', loadComponent: () => import('./pages/run-detail').then((m) => m.RunDetail) },
  { path: 'projects', loadComponent: () => import('./pages/projects').then((m) => m.Projects) },
  { path: 'suites', loadComponent: () => import('./pages/suites').then((m) => m.Suites) },
  { path: 'reports', loadComponent: () => import('./pages/reports').then((m) => m.Reports) },
  { path: 'settings', loadComponent: () => import('./pages/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: '' },
];
