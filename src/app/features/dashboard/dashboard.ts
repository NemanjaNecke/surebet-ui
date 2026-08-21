import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';

import { BestOddsMarket, OddsScope, SurebetKind, SurebetOpportunity } from '../../core/models';
import { RealtimeUpdates } from '../../core/realtime-updates';
import { Session } from '../../core/session';
import { SurebetApi } from '../../core/surebet-api';
import { verifiedTeamLogoUrl } from '../../core/team-logos';

type OpportunityKindFilter = 'all' | SurebetKind;
type PrematchTimeWindow = 'today' | '1h' | '3h' | 'tomorrow' | '3d' | 'all';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  readonly api = inject(SurebetApi);
  readonly session = inject(Session);
  readonly realtime = inject(RealtimeUpdates);
  readonly search = signal('');
  readonly searchInput = signal('');
  readonly suggestionsOpen = signal(false);
  readonly market = signal('All');
  readonly sport = signal('All');
  readonly scope = signal<OddsScope>('live');
  readonly bookmaker = signal('');
  readonly timeWindow = signal<PrematchTimeWindow>('today');
  readonly opportunityKind = signal<OpportunityKindFilter>('all');
  readonly marketView = signal<'odds' | 'surebets'>('odds');
  readonly selectedOpportunity = signal<SurebetOpportunity | null>(null);
  readonly stake = signal(100);
  readonly mobileFiltersOpen = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(12);
  readonly markets = ['All', '1X2', '2-Way', 'DC', 'O/U', 'BTTS'];
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
    'All',
    ...new Set(this.api.snapshot().bestOdds.map((item) => this.sportName(item.sport))),
  ]);

  readonly bookmakers = computed(() => [...new Set(
    this.api.snapshot().bestOdds.flatMap((item) => item.selections.map((selection) => selection.bookmaker)),
  )].sort());

  readonly opportunities = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.api.snapshot().opportunities.filter((item) => {
      const marketMatches = this.market() === 'All' || item.market.toLocaleLowerCase() === this.market().toLocaleLowerCase();
      const scopeMatches = item.scope === this.scope();
      const sportMatches = this.sport() === 'All' || this.sportForOpportunity(item) === this.sport();
      const bookmakerMatches = !this.bookmaker() || item.legs.some((leg) => leg.bookmaker === this.bookmaker());
      const timeMatches = this.matchesTimeWindow(item.kickoff, item.ageSeconds, item.scope);
      const kindMatches = this.opportunityKind() === 'all' || item.kind === this.opportunityKind();
      const queryMatches = !query || `${item.fixture} ${item.league} ${item.market} ${item.legs.map((leg) => this.displayName(leg.bookmaker)).join(' ')}`
        .toLocaleLowerCase().includes(query);
      return marketMatches && scopeMatches && sportMatches && bookmakerMatches && timeMatches && kindMatches && queryMatches;
    });
  });

  readonly bestOdds = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.api.snapshot().bestOdds.filter((item) => {
      const marketMatches = this.market() === 'All' || item.market.toLocaleLowerCase() === this.market().toLocaleLowerCase();
      const sportMatches = this.sport() === 'All' || this.sportName(item.sport) === this.sport();
      const scopeMatches = item.scope === this.scope();
      const bookmakerMatches = !this.bookmaker() || item.selections.some((selection) => selection.bookmaker === this.bookmaker());
      const timeMatches = this.matchesTimeWindow(item.kickoff, item.ageSeconds, item.scope);
      const queryMatches = !query || `${item.fixture} ${item.league} ${this.sportName(item.sport)} ${item.market} ${item.selections.map((selection) => this.displayName(selection.bookmaker)).join(' ')}`
        .toLocaleLowerCase().includes(query);
      return marketMatches && sportMatches && scopeMatches && bookmakerMatches && timeMatches && queryMatches;
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
    const start = (this.page() - 1) * this.pageSize();
    return this.bestOdds().slice(start, start + this.pageSize());
  });

  readonly pagedOpportunities = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.opportunities().slice(start, start + this.pageSize());
  });

  readonly resultCount = computed(() =>
    this.marketView() === 'odds' ? this.bestOdds().length : this.opportunities().length,
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
    this.market.set('All');
    this.mobileFiltersOpen.set(false);
    this.page.set(1);
    if (view === 'surebets') this.api.refresh(this.scope());
  }

  setScope(scope: OddsScope): void {
    this.scope.set(scope);
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
    this.bookmaker.set(this.bookmaker() === bookmaker ? '' : bookmaker);
    this.page.set(1);
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

  refreshCurrent(): void {
    this.api.refresh(this.scope());
  }

  fixtureTeams(fixture: string): string[] {
    return fixture.split(' — ').map((team) => team.trim()).filter(Boolean);
  }

  teamLogoUrl(team: string): string | null {
    return verifiedTeamLogoUrl(team);
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
      All: 'Sva tržišta',
      '2-Way': '2 ishoda',
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
