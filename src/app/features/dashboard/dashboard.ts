import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BestOddsMarket, OddsScope, SurebetKind, SurebetOpportunity } from '../../core/models';
import { Account } from '../../core/account';
import { RealtimeUpdates } from '../../core/realtime-updates';
import { Session } from '../../core/session';
import { SurebetApi } from '../../core/surebet-api';
import { TeamLogos } from '../../core/team-logos';

type OpportunityKindFilter = 'all' | SurebetKind;
type PrematchTimeWindow = 'today' | '1h' | '3h' | 'tomorrow' | '3d' | 'all';
type RegionCode = 'RS' | 'BA';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  readonly api = inject(SurebetApi);
  readonly session = inject(Session);
  readonly account = inject(Account);
  readonly realtime = inject(RealtimeUpdates);
  private readonly teamLogos = inject(TeamLogos);
  readonly search = signal('');
  readonly searchInput = signal('');
  readonly suggestionsOpen = signal(false);
  readonly market = signal('all');
  readonly sport = signal('all');
  readonly scope = signal<OddsScope>('live');
  readonly bookmaker = signal('');
  readonly countries = signal<ReadonlySet<RegionCode>>(new Set<RegionCode>(['RS', 'BA']));
  readonly timeWindow = signal<PrematchTimeWindow>('today');
  readonly opportunityKind = signal<OpportunityKindFilter>('all');
  readonly marketView = signal<'odds' | 'surebets'>('odds');
  readonly selectedOpportunity = signal<SurebetOpportunity | null>(null);
  readonly stake = signal(100);
  readonly mobileFiltersOpen = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(12);
  private readonly knownMarkets = signal<Array<{ scope: OddsScope; key: string; label: string }>>([]);
  readonly markets = computed(() => [
    { key: 'all', label: 'Sva tržišta' },
    ...(this.marketView() === 'odds'
      ? this.knownMarkets()
        .filter((item) => item.scope === this.scope())
        .map(({ key, label }) => ({ key, label }))
      : [...new Set(this.api.snapshot().opportunities
        .filter((item) => item.scope === this.scope())
        .map((item) => item.market))]
        .sort()
        .map((key) => ({ key, label: this.marketName(key) }))),
  ]);
  readonly pageSizes = [12, 24, 48];
  readonly timeWindows: ReadonlyArray<{ value: PrematchTimeWindow; label: string }> = [
    { value: 'today', label: 'Danas' },
    { value: '1h', label: '1 sat' },
    { value: '3h', label: '3 sata' },
    { value: 'tomorrow', label: 'Sutra' },
    { value: '3d', label: '3 dana' },
    { value: 'all', label: 'Sve' },
  ];
  private searchTimer: number | null = null;

  readonly sports = computed(() => [
    'all',
    ...new Set(this.api.snapshot().bestOdds.map((item) => item.sport.trim()).filter(Boolean)),
  ]);

  readonly bookmakers = computed(() => {
    const selectedCountries = this.countries();
    const catalog = this.api.bookmakerCatalog().filter(
      (item) => item.permitted && (!item.country || selectedCountries.has(item.country)),
    );
    if (catalog.length) return catalog;
    return [...new Set(
      this.api.snapshot().bestOdds.flatMap((item) => item.selections.map((selection) => selection.bookmaker)),
    )].sort().map((key) => ({ key, name: this.displayName(key), country: '' as const, permitted: true }));
  });

  readonly opportunities = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    const selectedCountries = this.countries();
    return this.api.snapshot().opportunities.filter((item) => {
      const marketMatches = this.market() === 'all' || item.market.toLocaleLowerCase() === this.market().toLocaleLowerCase();
      const scopeMatches = item.scope === this.scope();
      const sportMatches = this.sport() === 'all' || this.sportForOpportunity(item) === this.sportName(this.sport());
      const bookmakerMatches = !this.bookmaker() || item.legs.some((leg) => leg.bookmaker === this.bookmaker());
      const timeMatches = this.matchesTimeWindow(item.kickoff, item.ageSeconds, item.scope);
      const kindMatches = this.opportunityKind() === 'all' || item.kind === this.opportunityKind();
      const legCountries = item.legs.map((leg) => leg.country).filter(Boolean) as RegionCode[];
      const countryMatches = !legCountries.length || legCountries.every((country) => selectedCountries.has(country));
      const queryMatches = !query || `${item.fixture} ${item.league} ${item.market} ${item.legs.map((leg) => this.displayName(leg.bookmaker)).join(' ')}`
        .toLocaleLowerCase().includes(query);
      return marketMatches && scopeMatches && sportMatches && bookmakerMatches && timeMatches
        && kindMatches && countryMatches && queryMatches;
    });
  });

  readonly bestOdds = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    const selectedCountries = this.countries();
    return this.api.snapshot().bestOdds.map((item) => ({
      ...item,
      selections: item.selections.filter((selection) => {
        const country = this.countryForBookmaker(selection.bookmaker);
        return !country || selectedCountries.has(country);
      }),
    })).filter((item) => {
      const marketMatches = this.market() === 'all' || item.marketKey.toLocaleLowerCase() === this.market().toLocaleLowerCase();
      const sportMatches = this.sport() === 'all' || item.sport.toLocaleLowerCase() === this.sport().toLocaleLowerCase();
      const scopeMatches = item.scope === this.scope();
      const bookmakerMatches = !this.bookmaker() || item.selections.some((selection) => selection.bookmaker === this.bookmaker());
      const timeMatches = this.matchesTimeWindow(item.kickoff, item.ageSeconds, item.scope);
      const queryMatches = !query || `${item.fixture} ${item.league} ${this.sportName(item.sport)} ${item.market} ${item.selections.map((selection) => this.displayName(selection.bookmaker)).join(' ')}`
        .toLocaleLowerCase().includes(query);
      return item.selections.length > 0 && marketMatches && sportMatches && scopeMatches
        && bookmakerMatches && timeMatches && queryMatches;
    });
  });

  readonly searchCatalog = computed(() => {
    const entries = new Map<string, { label: string; type: string }>();
    const add = (label: string, type: string) => {
      const clean = label.trim();
      if (clean && !entries.has(clean.toLocaleLowerCase())) entries.set(clean.toLocaleLowerCase(), { label: clean, type });
    };
    for (const item of this.api.snapshot().bestOdds) {
      for (const team of item.fixture.split(' — ')) add(team, 'Tim');
      add(item.league, 'Liga');
      add(this.sportName(item.sport), 'Sport');
      for (const selection of item.selections) add(this.displayName(selection.bookmaker), 'Kladionica');
    }
    return [...entries.values()];
  });

  readonly suggestions = computed(() => {
    const query = this.searchInput().trim().toLocaleLowerCase();
    if (query.length < 2) return [];
    return this.searchCatalog()
      .filter((item) => item.label.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const leftStarts = left.label.toLocaleLowerCase().startsWith(query) ? 0 : 1;
        const rightStarts = right.label.toLocaleLowerCase().startsWith(query) ? 0 : 1;
        return leftStarts - rightStarts || left.label.localeCompare(right.label);
      })
      .slice(0, 8);
  });

  readonly pagedBestOdds = computed(() => {
    if (this.scope() === 'prematch') return this.bestOdds();
    const start = (this.page() - 1) * this.pageSize();
    return this.bestOdds().slice(start, start + this.pageSize());
  });

  readonly pagedOpportunities = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.opportunities().slice(start, start + this.pageSize());
  });

  readonly resultCount = computed(() =>
    this.marketView() === 'odds'
      ? this.scope() === 'prematch' ? this.api.prematchTotal() : this.bestOdds().length
      : this.opportunities().length,
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.resultCount() / this.pageSize())));
  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = Math.min(this.page(), total);
    const start = Math.max(1, Math.min(current - 2, total - 4));
    const end = Math.min(total, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
  readonly rangeStart = computed(() => this.resultCount() ? (this.page() - 1) * this.pageSize() + 1 : 0);
  readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.resultCount()));

  readonly bookmakerCount = computed(() => new Set(
    this.api.snapshot().bestOdds.flatMap((item) => item.selections.map((selection) => selection.bookmaker)),
  ).size);
  readonly connectedBookmakerCount = computed(() =>
    this.api.snapshot().bookmakers.filter((item) => item.status !== 'offline').length
      || this.bookmakerCount(),
  );

  readonly calculatorRows = computed(() => {
    const opportunity = this.selectedOpportunity();
    if (!opportunity?.legs.length) return [];
    const implied = opportunity.legs.reduce((sum, leg) => sum + 1 / leg.odds, 0);
    return opportunity.legs.map((leg) => ({
      ...leg,
      stake: this.stake() * (1 / leg.odds) / implied,
      return: this.stake() / implied,
    }));
  });

  readonly guaranteedReturn = computed(() => this.calculatorRows()[0]?.return ?? 0);
  readonly guaranteedProfit = computed(() => this.guaranteedReturn() - this.stake());
  readonly currentLoading = computed(() =>
    this.scope() === 'prematch' ? this.api.prematchLoading() : this.api.loading(),
  );
  readonly currentUpdated = computed(() =>
    this.scope() === 'prematch' ? this.api.lastPrematchUpdated() : this.api.lastLiveUpdated(),
  );

  constructor() {
    effect(() => {
      const discovered = this.api.snapshot().bestOdds.map((item) => ({
        scope: item.scope, key: item.marketKey, label: item.market,
      }));
      untracked(() => this.knownMarkets.update((current) => {
        const merged = new Map(current.map((item) => [`${item.scope}:${item.key}`, item]));
        for (const item of discovered) merged.set(`${item.scope}:${item.key}`, item);
        return [...merged.values()].sort((left, right) => left.label.localeCompare(right.label));
      }));
    });
    effect(() => {
      if (this.scope() !== 'prematch' || this.marketView() !== 'odds') return;
      const window = this.serverTimeWindow(this.timeWindow());
      this.api.setPrematchQuery({
        limit: this.pageSize(),
        offset: (this.page() - 1) * this.pageSize(),
        market: this.market(),
        sport: this.sport() === 'all' ? '' : this.sport(),
        bookie: this.bookmaker(),
        search: this.search(),
        kickoffFrom: window.from,
        kickoffTo: window.to,
      });
    });
    effect(() => {
      const selected = (['RS', 'BA'] as const).filter((country) => this.countries().has(country));
      const currentBookmaker = this.bookmaker();
      untracked(() => {
        this.api.setCountryFilter(selected);
        if (currentBookmaker && !this.bookmakers().some((item) => item.key === currentBookmaker)) {
          this.bookmaker.set('');
          this.page.set(1);
        }
      });
    });
  }

  setSearch(value: string): void {
    this.searchInput.set(value);
    this.suggestionsOpen.set(Boolean(value.trim()));
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => {
      this.search.set(value.trim());
      this.page.set(1);
      this.searchTimer = null;
    }, 100);
  }

  chooseSuggestion(label: string): void {
    this.searchInput.set(label);
    this.search.set(label);
    this.suggestionsOpen.set(false);
    this.page.set(1);
  }

  clearSearch(): void {
    this.searchInput.set('');
    this.search.set('');
    this.suggestionsOpen.set(false);
    this.page.set(1);
  }

  setStake(value: string): void {
    const parsed = Number(value);
    this.stake.set(Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 1_000_000)) : 100);
  }

  selectView(view: 'odds' | 'surebets'): void {
    this.marketView.set(view);
    this.market.set('all');
    this.mobileFiltersOpen.set(false);
    this.page.set(1);
    if (view === 'surebets') this.api.refresh(this.scope());
  }

  setScope(scope: OddsScope): void {
    this.scope.set(scope);
    this.market.set('all');
    this.page.set(1);
    if (scope === 'prematch') this.api.refresh('prematch');
  }

  setMarket(market: string): void {
    this.market.set(market);
    this.page.set(1);
  }

  setOpportunityKind(kind: OpportunityKindFilter): void {
    this.opportunityKind.set(kind);
    this.page.set(1);
  }

  setSport(sport: string): void {
    this.sport.set(sport);
    this.page.set(1);
  }

  setBookmaker(bookmaker: string): void {
    this.bookmaker.set(bookmaker);
    this.page.set(1);
  }

  toggleCountry(country: RegionCode, checked: boolean): void {
    const next = new Set(this.countries());
    if (checked) next.add(country);
    else next.delete(country);
    if (!next.size) return;
    this.countries.set(next);
    this.page.set(1);
  }

  countrySelected(country: RegionCode): boolean {
    return this.countries().has(country);
  }

  countryFlag(country: RegionCode | '' | null): string {
    return country === 'RS' ? '🇷🇸' : country === 'BA' ? '🇧🇦' : '🌐';
  }

  countryForBookmaker(bookmaker: string): RegionCode | null {
    const normalized = bookmaker.trim().toLocaleLowerCase();
    const catalogCountry = this.api.bookmakerCatalog().find(
      (item) => item.key.toLocaleLowerCase() === normalized,
    )?.country;
    if (catalogCountry === 'RS' || catalogCountry === 'BA') return catalogCountry;
    const serbia = new Set([
      'admiral_rs', 'balkanbet_rs', 'ibet365_rs', 'maxbet_rs', 'meridianbet_rs',
      'merkurxtip_rs', 'mozzart_com', 'soccerbet_rs', 'volcanobet_rs',
    ]);
    const bosnia = new Set([
      'admiral', 'betlive', 'betole', 'formula_ba', 'maxbet', 'mbet', 'mdshop',
      'meridianbet', 'mozzart', 'premier', 'soccerbet', 'sportplus', 'volcanobet',
      'wwin', 'xlivebet',
    ]);
    return serbia.has(normalized) ? 'RS' : bosnia.has(normalized) ? 'BA' : null;
  }

  setTimeWindow(value: PrematchTimeWindow): void {
    this.timeWindow.set(value);
    this.page.set(1);
  }

  private matchesTimeWindow(kickoff: string, ageSeconds: number, scope: OddsScope): boolean {
    if (scope === 'live') return true;
    const window = this.timeWindow();
    if (window === 'all') return true;
    const kickoffAt = Date.parse(kickoff);
    if (!Number.isFinite(kickoffAt)) return false;
    const now = new Date();
    if (window === '1h' || window === '3h' || window === '3d') {
      const hours = window === '1h' ? 1 : window === '3h' ? 3 : 72;
      const difference = kickoffAt - now.getTime();
      return difference >= 0 && difference <= hours * 3600 * 1000;
    }
    const dayOffset = window === 'tomorrow' ? 1 : 0;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset + 1).getTime();
    return kickoffAt >= Math.max(start, now.getTime()) && kickoffAt < end;
  }

  private serverTimeWindow(value: PrematchTimeWindow): { from?: string; to?: string } {
    if (value === 'all') return {};
    const now = new Date();
    if (value === '1h' || value === '3h' || value === '3d') {
      const hours = value === '1h' ? 1 : value === '3h' ? 3 : 72;
      return { from: now.toISOString(), to: new Date(now.getTime() + hours * 3_600_000).toISOString() };
    }
    const dayOffset = value === 'tomorrow' ? 1 : 0;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset + 1);
    return {
      from: new Date(Math.max(start.getTime(), value === 'today' ? now.getTime() : start.getTime())).toISOString(),
      to: end.toISOString(),
    };
  }

  private sportForOpportunity(item: SurebetOpportunity): string {
    const matching = this.api.snapshot().bestOdds.find((candidate) =>
      candidate.scope === item.scope && candidate.fixture === item.fixture,
    );
    return matching ? this.sportName(matching.sport) : '';
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.page.set(1);
  }

  goToPage(page: number): void {
    this.page.set(Math.max(1, Math.min(page, this.totalPages())));
    const board = document.getElementById('markets');
    if (board && typeof board.scrollIntoView === 'function') {
      board.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  fixtureTeams(fixture: string): string[] {
    return fixture.split(' — ').map((team) => team.trim()).filter(Boolean);
  }

  teamLogoUrl(team: string): string | null {
    return this.teamLogos.url(team);
  }

  teamInitials(team: string): string {
    const words = team.trim().split(/\s+/).filter((word) => !/^(?:fc|fk|cf|sc|ac|nk)$/i.test(word));
    return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase() ?? '').join('') || '?';
  }

  hideBrokenImage(event: Event): void {
    (event.currentTarget as HTMLImageElement).hidden = true;
  }

  openOpportunity(item: SurebetOpportunity): void {
    this.selectedOpportunity.set(item);
  }

  openComparison(item: BestOddsMarket): void {
    this.api.openComparison(item);
  }

  closeDrawer(): void {
    this.selectedOpportunity.set(null);
    this.api.closeComparison();
  }

  displayName(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  sportName(value: string): string {
    const normalized = value.trim().toLocaleLowerCase().replaceAll('_', ' ');
    return ({
      football: 'Fudbal', soccer: 'Fudbal', basketball: 'Košarka', tennis: 'Tenis',
      handball: 'Rukomet', volleyball: 'Odbojka', 'ice hockey': 'Hokej na ledu',
      hockey: 'Hokej', baseball: 'Bejzbol', 'table tennis': 'Stoni tenis',
      futsal: 'Futsal', rugby: 'Ragbi', cricket: 'Kriket', esports: 'E-sport',
    } as Record<string, string>)[normalized] ?? this.displayName(value);
  }

  marketName(value: string): string {
    return ({
      all: 'Sva tržišta',
      '2-Way': 'Pobednik',
      DC: 'Dupla šansa',
      'O/U': 'Više/Manje',
      BTTS: 'Oba daju gol',
    } as Record<string, string>)[value] ?? value;
  }

  livePeriodName(value: string): string {
    return ({ H1: '1. poluvreme', HT: 'poluvreme', H2: '2. poluvreme', ET: 'produžeci' } as Record<string, string>)[value]
      ?? value;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDrawer();
  }
}
