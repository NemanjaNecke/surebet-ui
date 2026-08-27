import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AdminUser, BookmakerOption } from '../../core/models';
import { runtimeConfig } from '../../core/runtime-config';

@Component({
  selector: 'app-admin',
  imports: [DatePipe, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin {
  private readonly http = inject(HttpClient);
  readonly users = signal<AdminUser[]>([]);
  readonly bookmakers = signal<BookmakerOption[]>([]);
  readonly loading = signal(true);
  readonly saving = signal('');
  readonly message = signal('');

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    forkJoin({
      users: this.http.get<{ items: AdminUser[] }>(`${runtimeConfig.apiBaseUrl}/admin/users`),
      bookmakers: this.http.get<{ items: BookmakerOption[] }>(`${runtimeConfig.apiBaseUrl}/admin/bookmakers`),
    }).subscribe({
      next: ({ users, bookmakers }) => {
        this.users.set(users.items);
        this.bookmakers.set(bookmakers.items);
        this.loading.set(false);
      },
      error: () => {
        this.message.set('Nije moguće učitati administraciju.');
        this.loading.set(false);
      },
    });
  }

  setFlag(user: AdminUser, field: 'is_enabled' | 'is_admin' | 'all_bookmakers', value: boolean): void {
    this.users.update((items) => items.map((item) => item.subject === user.subject
      ? { ...item, [field]: value }
      : item));
  }

  setBookmaker(user: AdminUser, bookmaker: string, enabled: boolean): void {
    const values = new Set(user.bookmakers);
    enabled ? values.add(bookmaker) : values.delete(bookmaker);
    this.users.update((items) => items.map((item) => item.subject === user.subject
      ? { ...item, bookmakers: [...values].sort() }
      : item));
  }

  save(user: AdminUser): void {
    this.saving.set(user.subject);
    this.message.set('');
    this.http.put<AdminUser>(
      `${runtimeConfig.apiBaseUrl}/admin/users/${encodeURIComponent(user.subject)}/access`,
      {
        is_enabled: user.is_enabled,
        is_admin: user.is_admin,
        all_bookmakers: user.all_bookmakers,
        bookmakers: user.bookmakers,
      },
    ).subscribe({
      next: (saved) => {
        this.users.update((items) => items.map((item) => item.subject === saved.subject ? saved : item));
        this.message.set(`Sačuvan pristup za ${saved.email || saved.display_name || saved.subject}.`);
        this.saving.set('');
      },
      error: () => {
        this.message.set('Čuvanje nije uspelo.');
        this.saving.set('');
      },
    });
  }
}
