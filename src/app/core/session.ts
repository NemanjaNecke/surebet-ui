import { Injectable, inject } from '@angular/core';
import { AuthService, User } from '@auth0/auth0-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';

import { authEnabled } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly auth = inject(AuthService, { optional: true });
  readonly enabled = authEnabled;
  readonly authenticated = toSignal(this.auth?.isAuthenticated$ ?? of(false), {
    initialValue: false,
  });
  readonly user = toSignal<User | null | undefined>(
    (this.auth?.user$ as Observable<User | null | undefined> | undefined) ?? of(null),
    { initialValue: null },
  );

  login(): void {
    this.auth?.loginWithRedirect();
  }

  logout(): void {
    this.auth?.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
