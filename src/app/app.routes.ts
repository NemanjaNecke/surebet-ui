import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    title: 'Najbolje kvote i surebetovi · SureEdge',
  },
  { path: '**', redirectTo: '' },
];
