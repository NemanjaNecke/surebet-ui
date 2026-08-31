import { Injectable, computed, inject } from '@angular/core';
import { AuthService, User } from '@auth0/auth0-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';

import { authEnabled, runtimeConfig } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly auth = inject(AuthService, { optional: true });
  private readonly router = inject(Router);
  readonly enabled = authEnabled;
  readonly authenticated = toSignal(this.auth?.isAuthenticated$ ?? of(false), {
    initialValue: false,
  });
  readonly loading = toSignal(this.auth?.isLoading$ ?? of(false), {
    initialValue: authEnabled,
  });
  readonly user = toSignal<User | null | undefined>(
    (this.auth?.user$ as Observable<User | null | undefined> | undefined) ?? of(null),
    { initialValue: null },
  );
  readonly ready = computed(() => !this.enabled || !this.loading());

  login(): void {
    void this.router.navigateByUrl('/prijava');
  }

  register(): void {
    void this.router.navigateByUrl('/registracija');
  }

  authenticate(mode: 'login' | 'signup'): void {
    const target = window.location.pathname.startsWith('/prijava')
      || window.location.pathname.startsWith('/registracija')
      ? '/'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const connection = runtimeConfig.auth.connection
      ? { connection: runtimeConfig.auth.connection }
      : {};
    this.auth?.loginWithRedirect({
      appState: { target },
      authorizationParams: mode === 'signup'
        ? { ...connection, screen_hint: 'signup' }
        : connection,
    });
  }

  logout(): void {
    sessionStorage.removeItem('kvotaradar.dashboard.v1');
    this.auth?.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
