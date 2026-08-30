import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Account } from '../../core/account';
import { PromotionCategory } from '../../core/models';
import { PromotionsApi } from '../../core/promotions-api';
import { Session } from '../../core/session';

type RegionCode = 'RS' | 'BA';
type CategoryFilter = 'all' | PromotionCategory;

@Component({
  selector: 'app-promotions',
  imports: [DatePipe, RouterLink],
  templateUrl: './promotions.html',
  styleUrl: './promotions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Promotions {
  readonly api = inject(PromotionsApi);
  readonly session = inject(Session);
  readonly account = inject(Account);
  readonly countries = signal<ReadonlySet<RegionCode>>(new Set<RegionCode>(['RS', 'BA']));
  readonly bookmaker = signal('');
  readonly category = signal<CategoryFilter>('all');
  readonly search = signal('');

  readonly bookmakers = computed(() => {
    const values = new Map<string, string>();
    for (const item of this.api.items()) values.set(item.bookmaker, item.bookmaker_name);
    return [...values.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  readonly promotions = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    const selectedCountries = this.countries();
    return this.api.items().filter((item) => {
      const countryMatches = selectedCountries.has(item.country);
      const bookmakerMatches = !this.bookmaker() || item.bookmaker === this.bookmaker();
      const categoryMatches = this.category() === 'all' || item.category === this.category();
      const queryMatches = !query || `${item.title} ${item.summary} ${item.bookmaker_name}`
        .toLocaleLowerCase().includes(query);
      return countryMatches && bookmakerMatches && categoryMatches && queryMatches;
    });
  });

  readonly activeSourceCount = computed(() =>
    this.api.sources().filter((source) => source.status === 'online' && source.count > 0).length,
  );

  constructor() {
    effect(() => {
      const selected = (['RS', 'BA'] as const).filter((country) => this.countries().has(country));
      this.api.load(selected);
      if (this.bookmaker() && !this.bookmakers().some((item) => item.key === this.bookmaker())) {
        this.bookmaker.set('');
      }
    });
  }

  toggleCountry(country: RegionCode, checked: boolean): void {
    const next = new Set(this.countries());
    if (checked) next.add(country);
    else next.delete(country);
    if (next.size) this.countries.set(next);
  }

  selected(country: RegionCode): boolean {
    return this.countries().has(country);
  }

  flag(country: RegionCode): string {
    return country === 'RS' ? '🇷🇸' : '🇧🇦';
  }

  categoryName(category: PromotionCategory): string {
    return ({ sport: 'Sportska ponuda', casino: 'Kazino', welcome: 'Dobrodošlica', other: 'Ostalo' })[category];
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  hideBrokenImage(event: Event): void {
    (event.currentTarget as HTMLImageElement).hidden = true;
  }
}
