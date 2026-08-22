import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    title: 'Najbolje kvote i surebetovi · SureEdge',
  },
  {
    path: 'prijava',
    loadComponent: () =>
      import('./features/auth/auth-page').then((module) => module.AuthPage),
    data: { mode: 'login' },
    title: 'Prijava · SureEdge',
  },
  {
    path: 'registracija',
    loadComponent: () =>
      import('./features/auth/auth-page').then((module) => module.AuthPage),
    data: { mode: 'signup' },
    title: 'Registracija · SureEdge',
  },
  { path: '**', redirectTo: '' },
];
