import { Routes } from '@angular/router';
import { adminGuard } from './core/account';

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin').then((module) => module.Admin),
    title: 'Administracija · KvotaRadar',
  },
  {
    path: 'promocije',
    loadComponent: () =>
      import('./features/promotions/promotions').then((module) => module.Promotions),
    title: 'Promocije · KvotaRadar',
  },
  { path: 'kladionice', redirectTo: 'promocije', pathMatch: 'full' },
  {
    path: 'ponuda',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    data: { page: 'prematch' },
    title: 'Ponuda pre meča · KvotaRadar',
  },
  {
    path: 'uzivo',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    data: { page: 'live' },
    title: 'Kvote uživo · KvotaRadar',
  },
  {
    path: 'surebet',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    data: { page: 'surebet' },
    title: 'Surebet prilike · KvotaRadar',
  },
  {
    path: 'middlebet',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    data: { page: 'middlebet' },
    title: 'Middlebet prilike · KvotaRadar',
  },
  {
    path: 'valuebet',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
    data: { page: 'valuebet' },
    title: 'Valuebet prilike · KvotaRadar',
  },
  {
    path: 'prijava',
    loadComponent: () =>
      import('./features/auth/auth-page').then((module) => module.AuthPage),
    data: { mode: 'login' },
    title: 'Prijava · KvotaRadar',
  },
  {
    path: 'registracija',
    loadComponent: () =>
      import('./features/auth/auth-page').then((module) => module.AuthPage),
    data: { mode: 'signup' },
    title: 'Registracija · KvotaRadar',
  },
  { path: '', redirectTo: 'ponuda', pathMatch: 'full' },
  { path: '**', redirectTo: 'ponuda' },
];
