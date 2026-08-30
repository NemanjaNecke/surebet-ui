import { Routes } from '@angular/router';
import { adminGuard } from './core/account';

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin').then((module) => module.Admin),
    title: 'Administracija · SureEdge',
  },
  {
    path: 'kladionice',
    loadComponent: () =>
      import('./features/promotions/promotions').then((module) => module.Promotions),
    title: 'Promocije kladionica · SureEdge',
  },
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
