import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { PromotionFeed, PromotionItem, PromotionSource } from './models';
import { runtimeConfig } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class PromotionsApi {
  private readonly http = inject(HttpClient);
  private requestKey = '';

  readonly items = signal<PromotionItem[]>([]);
  readonly sources = signal<PromotionSource[]>([]);
  readonly disclaimer = signal('Promocije prenose kladionice. Uslove proverite na originalnom sajtu.');
  readonly loading = signal(false);
  readonly error = signal('');

  load(countries: ReadonlyArray<'RS' | 'BA'>): void {
    const requested = (['RS', 'BA'] as const).filter((country) => countries.includes(country));
    const key = requested.join(',');
    if (!key || (this.loading() && this.requestKey === key)) return;
    this.requestKey = key;
    this.loading.set(true);
    this.error.set('');
    const params = new HttpParams().set('countries', key);
    this.http.get<PromotionFeed>(`${runtimeConfig.apiBaseUrl}/promotions`, { params }).pipe(
      finalize(() => {
        if (this.requestKey === key) this.loading.set(false);
      }),
    ).subscribe({
      next: (feed) => {
        if (this.requestKey !== key) return;
        this.items.set(feed.items);
        this.sources.set(feed.sources);
        this.disclaimer.set(feed.disclaimer);
      },
      error: () => {
        if (this.requestKey !== key) return;
        this.error.set('Promocije trenutno nisu dostupne. Prethodno učitani podaci ostaju prikazani.');
      },
    });
  }
}
