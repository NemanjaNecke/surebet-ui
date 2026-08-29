import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { AccountProfile } from './models';
import { runtimeConfig } from './runtime-config';
import { Session } from './session';

const ACCOUNT_CACHE_KEY = 'sureedge.account.v1';

function readCachedProfile(): AccountProfile | null {
  try {
    const raw = sessionStorage.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as AccountProfile;
    return profile?.subject && profile?.entitlement ? profile : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Account {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  readonly profile = signal<AccountProfile | null>(readCachedProfile());
  readonly loading = signal(false);

  constructor() {
    effect(() => {
      if (this.session.loading()) return;
      if (this.session.authenticated()) this.load().subscribe();
      else {
        this.profile.set(null);
        sessionStorage.removeItem(ACCOUNT_CACHE_KEY);
      }
    });
  }

  load(): Observable<AccountProfile | null> {
    if (this.loading()) return of(this.profile());
    this.loading.set(true);
    return this.http.get<AccountProfile>(`${runtimeConfig.apiBaseUrl}/auth/me`).pipe(
      tap((profile) => {
        this.profile.set(profile);
        sessionStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(profile));
      }),
      map((profile) => profile as AccountProfile | null),
      catchError(() => of(this.profile())),
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
