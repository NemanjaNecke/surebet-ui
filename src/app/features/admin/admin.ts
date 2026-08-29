import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AdminUser, BookmakerOption } from '../../core/models';
import { runtimeConfig } from '../../core/runtime-config';

type Notice = { kind: 'success' | 'error'; text: string };

@Component({
  selector: 'app-admin',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin {
  private readonly http = inject(HttpClient);
  readonly users = signal<AdminUser[]>([]);
  readonly bookmakers = signal<BookmakerOption[]>([]);
  readonly selectedSubject = signal('');
  readonly userQuery = signal('');
  readonly bookmakerQuery = signal('');
  readonly loading = signal(true);
  readonly saving = signal('');
  readonly creating = signal(false);
  readonly createOpen = signal(false);
  readonly notice = signal<Notice | null>(null);

  readonly accountForm = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
  });

  readonly filteredUsers = computed(() => {
    const query = this.userQuery().trim().toLocaleLowerCase();
    if (!query) return this.users();
    return this.users().filter((user) =>
      [user.display_name, user.email, user.subject]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query)),
    );
  });
  readonly filteredBookmakers = computed(() => {
    const query = this.bookmakerQuery().trim().toLocaleLowerCase();
    if (!query) return this.bookmakers();
    return this.bookmakers().filter((bookmaker) =>
      `${bookmaker.name} ${bookmaker.key} ${bookmaker.country}`.toLocaleLowerCase().includes(query),
    );
  });
  readonly selectedUser = computed(() =>
    this.users().find((user) => user.subject === this.selectedSubject()) ?? null,
  );
  readonly activeUsers = computed(() => this.users().filter((user) => user.is_enabled).length);
  readonly restrictedUsers = computed(() => this.users().filter((user) => !user.all_bookmakers).length);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.notice.set(null);
    forkJoin({
      users: this.http.get<{ items: AdminUser[] }>(`${runtimeConfig.apiBaseUrl}/admin/users`),
      bookmakers: this.http.get<{ items: BookmakerOption[] }>(`${runtimeConfig.apiBaseUrl}/admin/bookmakers`),
    }).subscribe({
      next: ({ users, bookmakers }) => {
        this.users.set(users.items);
        this.bookmakers.set(bookmakers.items);
        if (!this.selectedSubject() && users.items.length) this.selectedSubject.set(users.items[0].subject);
        this.loading.set(false);
      },
      error: () => {
        this.notice.set({ kind: 'error', text: 'Nije moguće učitati administraciju.' });
        this.loading.set(false);
      },
    });
  }

  selectUser(subject: string): void {
    this.selectedSubject.set(subject);
    this.notice.set(null);
  }

  setFlag(user: AdminUser, field: 'is_enabled' | 'all_bookmakers', value: boolean): void {
    this.patchUser(user.subject, { [field]: value });
  }

  setBookmaker(user: AdminUser, bookmaker: string, enabled: boolean): void {
    const values = new Set(user.bookmakers);
    enabled ? values.add(bookmaker) : values.delete(bookmaker);
    this.patchUser(user.subject, { bookmakers: [...values].sort() });
  }

  setAllBookmakers(user: AdminUser, enabled: boolean): void {
    this.patchUser(user.subject, {
      bookmakers: enabled ? this.bookmakers().map((item) => item.key).sort() : [],
    });
  }

  save(user: AdminUser): void {
    this.saving.set(user.subject);
    this.notice.set(null);
    this.http.put<AdminUser>(
      `${runtimeConfig.apiBaseUrl}/admin/users/${encodeURIComponent(user.subject)}/access`,
      {
        is_enabled: user.is_enabled,
        all_bookmakers: user.all_bookmakers,
        bookmakers: user.bookmakers,
      },
    ).subscribe({
      next: (saved) => {
        saved.is_admin = user.is_admin;
        this.patchUser(saved.subject, saved);
        this.notice.set({
          kind: 'success',
          text: `Sačuvan pristup za ${saved.email || saved.display_name || saved.subject}.`,
        });
        this.saving.set('');
      },
      error: () => {
        this.notice.set({ kind: 'error', text: 'Čuvanje pristupa nije uspelo.' });
        this.saving.set('');
      },
    });
  }

  createAccount(): void {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }
    const value = this.accountForm.getRawValue();
    this.creating.set(true);
    this.notice.set(null);
    this.http.post<AdminUser>(`${runtimeConfig.apiBaseUrl}/admin/users`, {
      email: value.email,
      password: value.password,
      display_name: value.displayName || null,
      is_enabled: true,
      all_bookmakers: true,
      bookmakers: [],
    }).subscribe({
      next: (created) => {
        this.users.update((items) => [created, ...items.filter((item) => item.subject !== created.subject)]);
        this.selectedSubject.set(created.subject);
        this.accountForm.reset();
        this.createOpen.set(false);
        this.creating.set(false);
        this.notice.set({
          kind: 'success',
          text: `Nalog ${created.email || created.display_name} je napravljen. Korisnik sada može da se prijavi.`,
        });
      },
      error: (error: HttpErrorResponse) => {
        const detail = error.error?.detail;
        const reason = typeof detail === 'object' ? detail?.message : detail;
        this.notice.set({ kind: 'error', text: reason || 'Kreiranje naloga nije uspelo.' });
        this.creating.set(false);
      },
    });
  }

  countryName(country: string): string {
    return country === 'RS' ? 'Srbija' : country === 'BA' ? 'BiH' : 'Regionalno';
  }

  private patchUser(subject: string, values: Partial<AdminUser>): void {
    this.users.update((items) => items.map((item) =>
      item.subject === subject ? { ...item, ...values } : item,
    ));
  }
}
