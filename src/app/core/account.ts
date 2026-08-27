import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { AccountProfile } from './models';
import { runtimeConfig } from './runtime-config';
import { Session } from './session';

@Injectable({ providedIn: 'root' })
export class Account {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  readonly profile = signal<AccountProfile | null>(null);
  readonly loading = signal(false);

  constructor() {
    effect(() => {
      if (this.session.loading()) return;
      if (this.session.authenticated()) this.load().subscribe();
      else this.profile.set(null);
    });
  }

  load(): Observable<AccountProfile | null> {
    if (this.loading()) return of(this.profile());
    this.loading.set(true);
    return this.http.get<AccountProfile>(`${runtimeConfig.apiBaseUrl}/auth/me`).pipe(
      tap((profile) => this.profile.set(profile)),
      map((profile) => profile as AccountProfile | null),
      catchError(() => {
        this.profile.set(null);
        return of(null);
      }),
      tap(() => this.loading.set(false)),
    );
  }

  requireAdmin(): Observable<boolean | UrlTree> {
    const current = this.profile();
    if (current) return of(current.entitlement.admin || this.router.parseUrl('/'));
    return this.load().pipe(
      map((profile) => Boolean(profile?.entitlement.admin) || this.router.parseUrl('/')),
    );
  }
}

export const adminGuard = () => inject(Account).requireAdmin();
