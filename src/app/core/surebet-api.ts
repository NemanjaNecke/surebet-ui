import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, TimeoutError, timeout } from 'rxjs';

import {
  BestOddsMarket,
  BestOddsSelection,
  BookmakerHealth,
  BookmakerOption,
  CollectionResponse,
  DashboardSnapshot,
  DataMode,
  MatchComparison,
  MatchTeamStatistics,
  MatchMarketOffers,
  MiddleBetOpportunity,
  LiveMatchState,
  OddsScope,
  SurebetLeg,
  SurebetOpportunity,
  ValueBetOpportunity,
} from './models';
import { PREVIEW_SNAPSHOT } from './preview-data';
import { authEnabled, runtimeConfig } from './runtime-config';
import { Session } from './session';

const API_ROOT = runtimeConfig.apiBaseUrl;
const LIVE_PAGE_LIMIT = 25;
const PREMATCH_PAGE_LIMIT = 12;
// WebSocket events are primary. This invisible poll closes gaps after tunnel
// reconnects without replacing the rendered snapshot or showing a loader.
const LIVE_REFRESH_MS = 60_000;
const PREMATCH_REFRESH_MS = 120_000;
const METADATA_REFRESH_MS = 300_000;
const DASHBOARD_CACHE_KEY = 'kvotaradar.dashboard.v1';
const EMPTY_SNAPSHOT: DashboardSnapshot = {
  bestOdds: [], opportunities: [], valuebets: [], middlebets: [], bookmakers: [], trend: [], liveEvents: 0, prematchEvents: 0,
};

interface CachedDashboardSnapshot {
  version: 1;
  savedAt: string;
  snapshot: DashboardSnapshot;
}

function readCachedSnapshot(): CachedDashboardSnapshot | null {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CachedDashboardSnapshot>;
    if (value.version !== 1 || !value.snapshot || !Array.isArray(value.snapshot.bestOdds)
      || !Array.isArray(value.snapshot.opportunities) || !Array.isArray(value.snapshot.valuebets)
      || !Array.isArray(value.snapshot.middlebets) || !Array.isArray(value.snapshot.bookmakers)) {
      sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
      return null;
    }
    return value as CachedDashboardSnapshot;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class SurebetApi {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(Session);
  private readonly restored = authEnabled ? readCachedSnapshot() : null;
  private readonly snapshotState = signal<DashboardSnapshot>(
    this.restored?.snapshot ?? (authEnabled ? EMPTY_SNAPSHOT : PREVIEW_SNAPSHOT),
  );
  private liveBest: BestOddsMarket[] = this.restored?.snapshot.bestOdds.filter((item) => item.scope === 'live') ?? [];
  private prematchCurrentBest: BestOddsMarket[] = this.restored?.snapshot.bestOdds.filter(
    (item) => item.scope === 'prematch' && !item.historical,
  ) ?? [];
  private prematchHistoryBest: BestOddsMarket[] = this.restored?.snapshot.bestOdds.filter(
    (item) => item.scope === 'prematch' && item.historical,
  ) ?? [];
  private liveOpportunities: SurebetOpportunity[] = this.restored?.snapshot.opportunities.filter(
    (item) => item.scope === 'live',
  ) ?? [];
  private prematchOpportunities: SurebetOpportunity[] = this.restored?.snapshot.opportunities.filter(
    (item) => item.scope === 'prematch',
  ) ?? [];
  private prematchValuebets: ValueBetOpportunity[] = this.restored?.snapshot.valuebets ?? [];
  private prematchMiddlebets: MiddleBetOpportunity[] = this.restored?.snapshot.middlebets ?? [];
  private bookmakers: BookmakerHealth[] = this.restored?.snapshot.bookmakers ?? [];
  private hasSuccessfulSnapshot = Boolean(this.restored);
  private consecutiveTransientFailures = 0;
  private liveEventTotal = this.restored?.snapshot.liveEvents ?? (authEnabled ? 0 : PREVIEW_SNAPSHOT.liveEvents);
  private prematchEventTotal = this.restored?.snapshot.prematchEvents ?? (authEnabled ? 0 : PREVIEW_SNAPSHOT.prematchEvents);
  private prematchCurrentTotal = this.prematchEventTotal;
  private prematchHistoryTotal = 0;
  private liveInFlight = false;
  private liveAuxInFlight = false;
  private prematchInFlight = false;
  private prematchRefreshQueued = false;
  private lastHealthRefreshAt = Number.NEGATIVE_INFINITY;
  private lastCatalogRefreshAt = Number.NEGATIVE_INFINITY;
  private requestBlockedUntil = 0;
  private countryCodes: Array<'RS' | 'BA'> = ['RS', 'BA'];
  private prematchQuery = new HttpParams()
    .set('limit', PREMATCH_PAGE_LIMIT)
    .set('countries', this.countryCodes.join(','));

  readonly snapshot = this.snapshotState.asReadonly();
  readonly mode = signal<DataMode>(authEnabled ? (this.restored ? 'stale' : 'loading') : 'preview');
  readonly loading = signal(false);
  readonly prematchLoading = signal(false);
  readonly lastUpdated = signal<Date | null>(this.restored ? new Date(this.restored.savedAt) : null);
  readonly lastLiveUpdated = signal<Date | null>(this.restored ? new Date(this.restored.savedAt) : null);
  readonly lastPrematchUpdated = signal<Date | null>(this.restored ? new Date(this.restored.savedAt) : null);
  readonly errorMessage = signal(
    this.restored
      ? 'Prikazani su poslednji podaci dok u pozadini proveravamo nove kvote.'
      : 'Prijavite se za prikaz aktuelnih regionalnih kvota.',
  );
  readonly comparison = signal<MatchComparison | null>(null);
  readonly comparisonLoading = signal(false);
  readonly comparisonError = signal('');
  readonly comparisonStatistics = signal<MatchTeamStatistics | null>(null);
  readonly comparisonStatisticsLoading = signal(false);
  readonly comparisonStatisticsError = signal('');
  private comparisonScope: OddsScope = 'prematch';
  readonly bookmakerCatalog = signal<BookmakerOption[]>([]);
  readonly prematchTotal = signal(this.prematchCurrentTotal);
  readonly healthyBookmakers = computed(
    () => this.snapshot().bookmakers.filter((item) => item.status === 'online').length,
  );

  constructor() {
    effect(() => {
      if (!authEnabled) return;
      if (this.session.loading()) return;
      if (this.session.authenticated()) {
        this.refresh('all', !this.hasSuccessfulSnapshot);
      } else {
        this.clearPrivateSnapshot();
      }
    });
    if (!authEnabled) this.refresh('all');
    const liveTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && this.canRequest()) this.refresh('live', false);
    }, LIVE_REFRESH_MS);
    const prematchTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && this.canRequest()) this.refresh('prematch', false);
    }, PREMATCH_REFRESH_MS);
    const refreshVisible = () => {
      if (document.visibilityState !== 'visible' || !this.canRequest()) return;
      this.refresh('live', false);
      const lastPrematch = this.lastPrematchUpdated()?.getTime() ?? 0;
      if (Date.now() - lastPrematch >= PREMATCH_REFRESH_MS) this.refresh('prematch', false);
    };
    document.addEventListener('visibilitychange', refreshVisible);
    this.destroyRef.onDestroy(() => {
      window.clearInterval(liveTimer);
      window.clearInterval(prematchTimer);
      document.removeEventListener('visibilitychange', refreshVisible);
    });
  }

  refresh(scope: 'all' | OddsScope = 'live', foreground = true): void {
    if (!this.canRequest()) return;
    if (scope === 'prematch') {
      this.refreshPrematch(foreground);
      return;
    }
    if (scope === 'live') {
      this.refreshLive(foreground);
      return;
    }
    this.refreshLive(foreground);
    this.refreshPrematch(foreground);
  }

  setCountryFilter(countries: ReadonlyArray<'RS' | 'BA'>): void {
    const requested = new Set(countries);
    const selected = (['RS', 'BA'] as const).filter((country) => requested.has(country));
    if (!selected.length || selected.join(',') === this.countryCodes.join(',')) return;
    this.countryCodes = selected;
    this.prematchQuery = this.prematchQuery.set('countries', selected.join(','));
    if (this.prematchInFlight) this.prematchRefreshQueued = true;
    this.refreshLive(false);
    this.refreshPrematch(false);
  }

  setPrematchQuery(query: {
    limit: number; offset: number; market?: string; sport?: string;
    bookie?: string; search?: string; kickoffFrom?: string; kickoffTo?: string;
  }): void {
    let params = new HttpParams()
      .set('limit', query.limit)
      .set('offset', query.offset)
      .set('countries', this.countryCodes.join(','));
    if (query.market && query.market !== 'all') params = params.set('market', query.market);
    if (query.sport) params = params.set('sport', query.sport);
    if (query.bookie) params = params.set('bookie', query.bookie);
    if (query.search) params = params.set('search', query.search);
    if (query.kickoffFrom) params = params.set('kickoff_from', query.kickoffFrom);
    if (query.kickoffTo) params = params.set('kickoff_to', query.kickoffTo);
    this.prematchQuery = params;
    if (this.prematchInFlight) {
      this.prematchRefreshQueued = true;
      return;
    }
    this.refreshPrematch(false);
  }

  private loadAll(): void {
    if (this.loading() || this.prematchLoading()) return;
    this.loading.set(true);
    this.prematchLoading.set(true);
    const liveParams = new HttpParams()
      .set('limit', LIVE_PAGE_LIMIT)
      .set('countries', this.countryCodes.join(','));
    const prematchParams = new HttpParams()
      .set('limit', PREMATCH_PAGE_LIMIT)
      .set('countries', this.countryCodes.join(','));
    const prematchWindow = prematchParams
      .set('include_history', 'true')
      .set('history_only', 'true')
      .set('history_hours', '168');
    forkJoin({
      liveOdds: this.http
        .get<CollectionResponse>(`${API_ROOT}/odds/live/best`, { params: liveParams })
        .pipe(timeout(8000)),
      prematchOdds: this.http
        .get<CollectionResponse>(`${API_ROOT}/odds/prematch/best`, { params: prematchParams })
        .pipe(timeout(8000)),
      prematchHistory: this.http
        .get<CollectionResponse>(`${API_ROOT}/odds/prematch/best`, { params: prematchWindow })
        .pipe(timeout(8000)),
      liveSurebets: this.http
        .get<CollectionResponse>(`${API_ROOT}/surebets/live`, { params: liveParams })
        .pipe(timeout(8000)),
      prematchSurebets: this.loadPrematchSurebets(this.prematchOpportunityParams()).pipe(timeout(8000)),
      prematchValuebets: this.http.get<CollectionResponse>(`${API_ROOT}/valuebets/prematch`, { params: this.prematchOpportunityParams() }).pipe(timeout(8000)),
      prematchMiddlebets: this.http.get<CollectionResponse>(`${API_ROOT}/middlebets/prematch`, { params: this.prematchOpportunityParams() }).pipe(timeout(8000)),
      health: this.http
        .get<Record<string, unknown>>(`${API_ROOT}/bookmakers/health`)
        .pipe(timeout(8000)),
      catalog: this.http
        .get<{ items: BookmakerOption[] }>(`${API_ROOT}/bookmakers`)
        .pipe(timeout(8000)),
    })
      .pipe(
        map((payload) => {
          this.liveBest = payload.liveOdds.items.flatMap((row, index) =>
            this.toBestOddsMarkets(row, index, 'live'),
          );
          const prematchRows = [...payload.prematchOdds.items, ...payload.prematchHistory.items];
          this.prematchCurrentBest = payload.prematchOdds.items.flatMap((row, index) =>
            this.toBestOddsMarkets(row, index, 'prematch'),
          );
          this.prematchHistoryBest = payload.prematchHistory.items.flatMap((row, index) =>
            this.toBestOddsMarkets(row, index, 'prematch'),
          );
          this.liveEventTotal = payload.liveOdds.total ?? payload.liveOdds.count;
          this.prematchEventTotal = (payload.prematchOdds.total ?? payload.prematchOdds.count)
            + (payload.prematchHistory.total ?? payload.prematchHistory.count);
          this.liveOpportunities = payload.liveSurebets.items.map((row, index) =>
            this.toOpportunity(row, index, 'live'),
          );
          this.prematchOpportunities = payload.prematchSurebets.items.map((row, index) =>
            this.toOpportunity(row, index, 'prematch'),
          );
          this.prematchValuebets = payload.prematchValuebets.items.map((row, index) =>
            this.toValuebet(row, index),
          );
          this.prematchMiddlebets = payload.prematchMiddlebets.items.map((row, index) =>
            this.toMiddlebet(row, index),
          );
          this.bookmakers = this.toBookmakers(payload.health);
          this.bookmakerCatalog.set(payload.catalog.items);
          return this.combinedSnapshot();
        }),
        catchError((error: HttpErrorResponse) => {
          this.setConnectionError(error);
          return of(this.hasSuccessfulSnapshot ? null : PREVIEW_SNAPSHOT);
        }),
      )
      .subscribe((snapshot) => {
        if (snapshot) this.publishSnapshot(snapshot);
        if (snapshot && snapshot !== PREVIEW_SNAPSHOT) {
          this.hasSuccessfulSnapshot = true;
          this.consecutiveTransientFailures = 0;
          this.mode.set('live');
          this.errorMessage.set('');
          const updated = new Date();
          this.lastLiveUpdated.set(updated);
          this.lastPrematchUpdated.set(updated);
        }
        if (snapshot) this.lastUpdated.set(new Date());
        this.loading.set(false);
        this.prematchLoading.set(false);
      });
  }

  private refreshLive(foreground = true): void {
    if (this.liveInFlight) return;
    this.liveInFlight = true;
    if (foreground) this.loading.set(true);
    const limited = new HttpParams()
      .set('limit', LIVE_PAGE_LIMIT)
      .set('countries', this.countryCodes.join(','));
    this.refreshLiveAuxiliary(limited);
    this.http.get<CollectionResponse>(`${API_ROOT}/odds/live/best`, { params: limited }).pipe(
      timeout(20_000),
      map((payload) => {
        this.liveBest = payload.items.flatMap((row, index) => this.toBestOddsMarkets(row, index, 'live'));
        this.liveEventTotal = payload.total ?? payload.count;
        return this.combinedSnapshot();
      }),
      catchError((error: HttpErrorResponse) => {
        this.setConnectionError(error);
        return of(null);
      }),
    ).subscribe((snapshot) => {
      if (snapshot) {
        this.publishSnapshot(snapshot);
        this.hasSuccessfulSnapshot = true;
        this.consecutiveTransientFailures = 0;
        this.mode.set('live');
        this.errorMessage.set('');
        this.lastLiveUpdated.set(new Date());
      }
      if (snapshot) this.lastUpdated.set(new Date());
      this.liveInFlight = false;
      if (foreground) this.loading.set(false);
    });
  }

  private refreshLiveAuxiliary(limited: HttpParams): void {
    if (this.liveAuxInFlight) return;
    this.liveAuxInFlight = true;
    const now = Date.now();
    const refreshHealth = now - this.lastHealthRefreshAt >= METADATA_REFRESH_MS;
    const refreshCatalog = now - this.lastCatalogRefreshAt >= METADATA_REFRESH_MS;
    forkJoin({
      surebets: this.http.get<CollectionResponse>(`${API_ROOT}/surebets/live`, { params: limited }).pipe(
        timeout(20_000), catchError(() => of(null)),
      ),
      health: refreshHealth
        ? this.http.get<Record<string, unknown>>(`${API_ROOT}/bookmakers/health`).pipe(
            timeout(20_000), catchError(() => of(null)),
          )
        : of(null),
      catalog: refreshCatalog
        ? this.http.get<{ items: BookmakerOption[] }>(`${API_ROOT}/bookmakers`).pipe(
            timeout(20_000), catchError(() => of(null)),
          )
        : of(null),
    }).subscribe(({ surebets, health, catalog }) => {
      if (surebets) {
        this.liveOpportunities = surebets.items.map((row, index) =>
          this.toOpportunity(row, index, 'live'),
        );
      }
      if (health) {
        this.bookmakers = this.toBookmakers(health);
        this.lastHealthRefreshAt = Date.now();
      }
      if (catalog) {
        this.bookmakerCatalog.set(catalog.items);
        this.lastCatalogRefreshAt = Date.now();
      }
      if (surebets || health || catalog) this.publishSnapshot(this.combinedSnapshot());
      this.liveAuxInFlight = false;
    });
  }

  private refreshPrematch(foreground = true): void {
    if (this.prematchInFlight) return;
    this.prematchInFlight = true;
    if (foreground) this.prematchLoading.set(true);
    const limited = this.prematchQuery;
    this.refreshPrematchSurebets();
    this.http.get<CollectionResponse>(`${API_ROOT}/odds/prematch/best`, { params: limited }).pipe(
      timeout(15_000),
      map((payload) => {
        this.prematchCurrentBest = payload.items.flatMap((row, index) =>
          this.toBestOddsMarkets(row, index, 'prematch'),
        );
        this.prematchCurrentTotal = payload.total ?? payload.count;
        this.prematchTotal.set(this.prematchCurrentTotal);
        this.prematchEventTotal = this.prematchCurrentTotal + this.prematchHistoryTotal;
        return this.combinedSnapshot();
      }),
      catchError((error: HttpErrorResponse) => {
        this.setConnectionError(error);
        return of(null);
      }),
    ).subscribe((snapshot) => {
      if (snapshot) {
        this.publishSnapshot(snapshot);
        this.hasSuccessfulSnapshot = true;
        this.consecutiveTransientFailures = 0;
        this.mode.set('live');
        this.errorMessage.set('');
        this.lastPrematchUpdated.set(new Date());
      }
      if (snapshot) this.lastUpdated.set(new Date());
      this.prematchInFlight = false;
      if (foreground) this.prematchLoading.set(false);
      // Current prices are the interactive path. Load historical fixtures only
      // after they have rendered so the two large prematch queries do not
      // compete for the same database resources and blank the dashboard.
      if (!limited.has('kickoff_from') && !limited.has('kickoff_to') && !limited.has('offset')) {
        this.refreshPrematchHistory(limited);
      }
      if (this.prematchRefreshQueued) {
        this.prematchRefreshQueued = false;
        this.refreshPrematch(false);
      }
    });
  }

  private refreshPrematchHistory(limited: HttpParams): void {
    const params = limited
      .set('include_history', 'true')
      .set('history_only', 'true')
      .set('history_hours', '168');
    this.http.get<CollectionResponse>(`${API_ROOT}/odds/prematch/best`, { params }).pipe(
      timeout(20_000),
      catchError(() => of(null)),
    ).subscribe((payload) => {
      if (!payload) return;
      this.prematchHistoryBest = payload.items.flatMap((row, index) =>
        this.toBestOddsMarkets(row, index, 'prematch'),
      );
      this.prematchHistoryTotal = payload.total ?? payload.count;
      this.prematchEventTotal = this.prematchCurrentTotal + this.prematchHistoryTotal;
      this.publishSnapshot(this.combinedSnapshot());
    });
  }

  private refreshPrematchSurebets(): void {
    const opportunityParams = this.prematchOpportunityParams();
    forkJoin({
      surebets: this.loadPrematchSurebets(opportunityParams).pipe(catchError(() => of(null))),
      valuebets: this.http.get<CollectionResponse>(`${API_ROOT}/valuebets/prematch`, { params: opportunityParams }).pipe(catchError(() => of(null))),
      middlebets: this.http.get<CollectionResponse>(`${API_ROOT}/middlebets/prematch`, { params: opportunityParams }).pipe(catchError(() => of(null))),
    }).pipe(timeout(15_000), catchError(() => of(null))).subscribe((payload) => {
      if (!payload) return;
      if (payload.surebets) this.prematchOpportunities = payload.surebets.items.map(
        (row, index) => this.toOpportunity(row, index, 'prematch'),
      );
      if (payload.valuebets) this.prematchValuebets = payload.valuebets.items.map(
        (row, index) => this.toValuebet(row, index),
      );
      if (payload.middlebets) this.prematchMiddlebets = payload.middlebets.items.map(
        (row, index) => this.toMiddlebet(row, index),
      );
      this.publishSnapshot(this.combinedSnapshot());
    });
  }

  private loadPrematchSurebets(params: HttpParams): Observable<CollectionResponse> {
    return this.http.get<CollectionResponse>(`${API_ROOT}/surebets/prematch`, { params });
  }

  private prematchOpportunityParams(): HttpParams {
    return new HttpParams()
      .set('limit', 250)
      .set('countries', this.countryCodes.join(','));
  }

  openComparison(item: BestOddsMarket): void {
    this.comparison.set(null);
    this.comparisonError.set('');
    this.comparisonStatistics.set(null);
    this.comparisonStatisticsError.set('');
    this.comparisonStatisticsLoading.set(false);
    this.comparisonScope = item.scope;
    if (this.mode() === 'preview' || this.mode() === 'offline') {
      this.comparison.set(this.previewComparison(item));
      return;
    }
    this.comparisonLoading.set(true);
    const prefix = item.scope === 'prematch' ? '/prematch' : '';
    this.http
      .get<Record<string, unknown>>(
        `${API_ROOT}${prefix}/matches/${encodeURIComponent(item.matchId)}/odds`,
        { params: { _: Date.now().toString() } },
      )
      .pipe(
        timeout(8000),
        catchError(() => {
          this.comparisonError.set('Nije moguće učitati sve kvote za ovaj događaj.');
          return of(null);
        }),
      )
      .subscribe((payload) => {
        if (payload) this.comparison.set(this.toComparison(payload, item));
        this.comparisonLoading.set(false);
      });
  }

  closeComparison(): void {
    this.comparison.set(null);
    this.comparisonError.set('');
    this.comparisonStatistics.set(null);
    this.comparisonStatisticsError.set('');
    this.comparisonStatisticsLoading.set(false);
  }

  loadComparisonStatistics(): void {
    const comparison = this.comparison();
    if (!comparison || this.comparisonStatistics() || this.comparisonStatisticsLoading()) return;
    if (this.mode() === 'preview' || this.mode() === 'offline') {
      this.comparisonStatisticsError.set('Statistika nije dostupna u demo prikazu.');
      return;
    }
    this.comparisonStatisticsLoading.set(true);
    this.comparisonStatisticsError.set('');
    const prefix = this.comparisonScope === 'prematch' ? '/prematch' : '';
    this.http.get<MatchTeamStatistics>(
      `${API_ROOT}${prefix}/matches/${encodeURIComponent(comparison.matchId)}/statistics`,
      { params: { _: Date.now().toString() } },
    ).pipe(
      timeout(8000),
      catchError((_error: HttpErrorResponse) => {
        this.comparisonStatisticsError.set('Trenutno ne možemo da učitamo statistiku.');
        return of(null);
      }),
    ).subscribe((payload) => {
      if (payload) this.comparisonStatistics.set(payload);
      this.comparisonStatisticsLoading.set(false);
    });
  }

  private canRequest(): boolean {
    if (Date.now() < this.requestBlockedUntil) return false;
    return !authEnabled || (this.session.ready() && this.session.authenticated());
  }

  private publishSnapshot(snapshot: DashboardSnapshot): void {
    this.snapshotState.set(snapshot);
    if (!authEnabled) return;
    try {
      sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        snapshot,
      } satisfies CachedDashboardSnapshot));
    } catch {
      // A full provider market can exceed a browser's storage quota. Rendering
      // and realtime refresh continue normally even when the optional cache
      // cannot be written.
    }
  }

  private clearPrivateSnapshot(): void {
    sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
    this.liveBest = [];
    this.prematchCurrentBest = [];
    this.prematchHistoryBest = [];
    this.liveOpportunities = [];
    this.prematchOpportunities = [];
    this.prematchValuebets = [];
    this.prematchMiddlebets = [];
    this.bookmakers = [];
    this.bookmakerCatalog.set([]);
    this.liveEventTotal = 0;
    this.prematchEventTotal = 0;
    this.prematchCurrentTotal = 0;
    this.prematchTotal.set(0);
    this.prematchHistoryTotal = 0;
    this.hasSuccessfulSnapshot = false;
    this.snapshotState.set(EMPTY_SNAPSHOT);
    this.mode.set('loading');
    this.errorMessage.set('Prijavite se za prikaz aktuelnih regionalnih kvota.');
  }

  private combinedSnapshot(): DashboardSnapshot {
    return {
      bestOdds: [...this.liveBest, ...this.prematchCurrentBest, ...this.prematchHistoryBest],
      opportunities: [...this.liveOpportunities, ...this.prematchOpportunities]
        .sort((left, right) => right.roi - left.roi),
      valuebets: this.prematchValuebets,
      middlebets: this.prematchMiddlebets,
      bookmakers: this.bookmakers,
      trend: [],
      liveEvents: this.liveEventTotal,
      prematchEvents: this.prematchEventTotal,
    };
  }

  private setConnectionError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : null;
    if (error instanceof HttpErrorResponse && status === 429) {
      const body = typeof error.error === 'string' ? error.error : JSON.stringify(error.error ?? '');
      if (body.includes('1027')) {
        const nextReset = new Date();
        nextReset.setUTCHours(24, 1, 0, 0);
        this.requestBlockedUntil = nextReset.getTime();
      } else {
        this.requestBlockedUntil = Date.now() + 60_000;
      }
    }
    const transient = error instanceof TimeoutError
      || status === 0
      || status === 408
      || status === 429
      || (status !== null && status >= 500);
    if (this.hasSuccessfulSnapshot && transient) {
      this.consecutiveTransientFailures += 1;
      if (this.consecutiveTransientFailures < 3) return;
      this.mode.set('stale');
      this.errorMessage.set(
        'Osvežavanje trenutno kasni. Prikazani su poslednji uspešno učitani podaci.',
      );
      return;
    }
    this.mode.set(authEnabled || status === 0 ? 'offline' : 'preview');
    this.errorMessage.set(
      status === 401 || status === 403
        ? 'API je povezan. Prijavite se nalogom koji ima pristup podacima.'
        : authEnabled
          ? 'Nije moguće učitati podatke sa API-ja. Pokušavamo ponovo bez prekidanja stranice.'
          : 'API za kvote trenutno nije dostupan. Prikazani su jasno označeni demo podaci.',
    );
  }

  private toBestOddsMarkets(
    row: Record<string, unknown>,
    matchIndex: number,
    scope: OddsScope,
  ): BestOddsMarket[] {
    const matchId = String(row['match_id'] ?? `${scope}-${matchIndex}`);
    const updatedAt = String(row['updated_at'] ?? new Date().toISOString());
    const markets = Array.isArray(row['markets']) ? (row['markets'] as Record<string, unknown>[]) : [];
    return markets.map((marketRow, marketIndex) => {
      const rawMarket = String(marketRow['market'] ?? 'Market');
      const lineValue = marketRow['line'];
      const line = lineValue === null || lineValue === undefined ? null : Number(lineValue);
      const selections = Array.isArray(marketRow['outcomes'])
        ? (marketRow['outcomes'] as Record<string, unknown>[]).map(
            (outcome): BestOddsSelection => ({
              label: String(outcome['outcome_label'] ?? outcome['outcome'] ?? '?'),
              bookmaker: String(outcome['bookmaker'] ?? 'Unknown'),
              odds: Number(outcome['price'] ?? 0),
              observedAt: String(outcome['observed_at'] ?? updatedAt),
            }),
          )
        : [];
      const observedTimes = selections.map((selection) => Date.parse(selection.observedAt)).filter(Number.isFinite);
      const freshest = observedTimes.length ? Math.max(...observedTimes) : Date.parse(updatedAt);
      const ageSeconds = Math.max(0, Math.round((Date.now() - freshest) / 1000));
      return {
        id: `${scope}-${matchId}-${rawMarket}-${String(marketRow['period'] ?? 'FT')}-${line ?? ''}-${marketIndex}`,
        matchId,
        scope,
        historical: Boolean(row['historical']),
        liveState: this.toLiveState(row),
        sport: String(row['sport'] ?? 'Sport'),
        market: String(marketRow['market_label'] ?? this.marketLabel(rawMarket, selections.length)),
        marketKey: rawMarket,
        period: String(marketRow['period'] ?? 'FT'),
        line: Number.isFinite(line) ? line : null,
        fixture: `${String(row['home'] ?? 'Home')} — ${String(row['away'] ?? 'Away')}`,
        league: String(row['league'] ?? 'Unknown league'),
        kickoff: String(row['kickoff_utc'] ?? ''),
        ageSeconds: Number.isFinite(ageSeconds) ? ageSeconds : 0,
        selections,
      };
    });
  }

  private toOpportunity(
    row: Record<string, unknown>,
    index: number,
    scope: OddsScope,
    fallbackMarket = '',
  ): SurebetOpportunity {
    const rawLegs = Array.isArray(row['legs']) ? (row['legs'] as Record<string, unknown>[]) : [];
    const rawLine = row['line'] === null || row['line'] === undefined || row['line'] === ''
      ? Number.NaN
      : Number(row['line']);
    const opportunityLine = Number.isFinite(rawLine) ? rawLine : null;
    const legs: SurebetLeg[] = rawLegs.map((leg) => {
      const rawLegLine = leg['line'] === null || leg['line'] === undefined || leg['line'] === ''
        ? Number.NaN
        : Number(leg['line']);
      return {
        label: String(leg['outcome'] ?? '?'),
        bookmaker: String(leg['bookmaker'] ?? 'Unknown'),
        odds: Number(leg['price'] ?? 0),
        line: Number.isFinite(rawLegLine) ? rawLegLine : opportunityLine,
        country: this.countryForBookmaker(String(leg['bookmaker'] ?? '')),
      };
    });
    if (!legs.length) {
      const candidates: [string, string, string][] = fallbackMarket === 'DC'
        ? [[String(row['pair'] ?? 'DC'), 'best_dc_src', 'best_dc'], ['Opposite', 'best_so_src', 'best_so']]
        : [['1', 'src_1', 'best_1'], ['X', 'src_X', 'best_X'], ['2', 'src_2', 'best_2']];
      for (const [label, sourceKey, oddsKey] of candidates) {
        const odds = Number(row[oddsKey]);
        if (Number.isFinite(odds) && odds > 1) {
          const bookmaker = String(row[sourceKey] ?? 'Unknown');
          legs.push({ label, bookmaker, odds, line: opportunityLine, country: this.countryForBookmaker(bookmaker) });
        }
      }
    }
    const observedTimes = rawLegs.map((leg) => Date.parse(String(leg['observed_at'] ?? ''))).filter(Number.isFinite);
    const computedAt = String(row['computed_at'] ?? (observedTimes.length
      ? new Date(Math.min(...observedTimes)).toISOString()
      : new Date().toISOString()));
    const parsedComputedAt = Date.parse(computedAt);
    const ageSeconds = Number.isFinite(parsedComputedAt)
      ? Math.max(0, Math.round((Date.now() - parsedComputedAt) / 1000))
      : 0;
    const rawMarket = String(
      row['market'] ?? row['market_type'] ?? (fallbackMarket || (legs.length === 3 ? '1X2' : '2-Way')),
    );
    const pair = String(row['pair'] ?? '').trim();
    const countries = new Set(legs.map((leg) => leg.country).filter(Boolean));
    const kind = countries.size > 1
      ? 'cross-market'
      : 'same-market';
    const rawRoi = Number(row['roi'] ?? row['ROI'] ?? 0);
    const roi = Math.abs(rawRoi) <= 1 ? rawRoi * 100 : rawRoi;
    return {
      id: String(row['id'] ?? `${scope}-${String(row['match_id'] ?? row['canon_key'] ?? index)}-${rawMarket}-${String(row['pair'] ?? '')}`),
      scope,
      liveState: this.toLiveState(row),
      kind,
      pair: pair || null,
      market: String(row['market_label'] ?? this.marketLabel(rawMarket, legs.length)),
      period: String(row['period'] ?? 'FT'),
      line: opportunityLine,
      fixture: `${String(row['home'] ?? 'Home')} — ${String(row['away'] ?? 'Away')}`,
      league: String(row['league'] ?? 'Unknown league'),
      kickoff: String(row['kickoff_utc'] ?? ''),
      roi: Number.isFinite(roi) ? roi : 0,
      profit: Number.isFinite(roi) ? roi * 10 : 0,
      ageSeconds,
      legs,
    };
  }

  private toValuebet(row: Record<string, unknown>, index: number): ValueBetOpportunity {
    const observedAt = String(row['observed_at'] ?? new Date().toISOString());
    const parsed = Date.parse(observedAt);
    const rawLine = row['line'] === null || row['line'] === undefined || row['line'] === ''
      ? Number.NaN : Number(row['line']);
    return {
      id: String(row['id'] ?? `valuebet-${index}`),
      matchId: String(row['match_id'] ?? ''),
      sport: String(row['sport'] ?? ''),
      fixture: `${String(row['home'] ?? 'Home')} — ${String(row['away'] ?? 'Away')}`,
      league: String(row['league'] ?? ''),
      kickoff: String(row['kickoff_utc'] ?? ''),
      market: String(row['market_label'] ?? row['market'] ?? ''),
      period: String(row['period'] ?? 'FT'),
      line: Number.isFinite(rawLine) ? rawLine : null,
      outcome: String(row['outcome'] ?? row['outcome_key'] ?? ''),
      bookmaker: String(row['bookmaker'] ?? ''),
      odds: Number(row['price'] ?? 0),
      fairOdds: Number(row['fair_odds'] ?? 0),
      fairProbability: Number(row['fair_probability'] ?? 0) * 100,
      expectedValue: Number(row['expected_value'] ?? 0) * 100,
      referenceBookmakers: Number(row['reference_bookmakers'] ?? 0),
      ageSeconds: Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : 0,
    };
  }

  private toMiddlebet(row: Record<string, unknown>, index: number): MiddleBetOpportunity {
    const rawLegs = Array.isArray(row['legs']) ? row['legs'] as Record<string, unknown>[] : [];
    const observed = rawLegs.map((leg) => Date.parse(String(leg['observed_at'] ?? ''))).filter(Number.isFinite);
    return {
      id: String(row['id'] ?? `middlebet-${index}`),
      matchId: String(row['match_id'] ?? ''),
      sport: String(row['sport'] ?? ''),
      fixture: `${String(row['home'] ?? 'Home')} — ${String(row['away'] ?? 'Away')}`,
      league: String(row['league'] ?? ''),
      kickoff: String(row['kickoff_utc'] ?? ''),
      market: String(row['market_label'] ?? row['market'] ?? ''),
      period: String(row['period'] ?? 'FT'),
      gap: Number(row['middle_gap'] ?? 0),
      hitRoi: Number(row['hit_roi'] ?? 0) * 100,
      missRoi: Number(row['miss_roi'] ?? 0) * 100,
      ageSeconds: observed.length ? Math.max(0, Math.round((Date.now() - Math.min(...observed)) / 1000)) : 0,
      legs: rawLegs.map((leg) => ({
        label: String(leg['outcome'] ?? leg['outcome_key'] ?? ''),
        bookmaker: String(leg['bookmaker'] ?? ''),
        odds: Number(leg['price'] ?? 0),
        line: leg['line'] !== null && leg['line'] !== undefined && leg['line'] !== ''
          && Number.isFinite(Number(leg['line'])) ? Number(leg['line']) : null,
        country: this.countryForBookmaker(String(leg['bookmaker'] ?? '')),
      })),
    };
  }

  private toComparison(payload: Record<string, unknown>, fallback: BestOddsMarket): MatchComparison {
    const match = (payload['match'] ?? {}) as Record<string, unknown>;
    const markets = Array.isArray(payload['markets']) ? (payload['markets'] as Record<string, unknown>[]) : [];
    return {
      matchId: fallback.matchId,
      fixture: `${String(match['home'] ?? fallback.fixture.split(' — ')[0])} — ${String(match['away'] ?? fallback.fixture.split(' — ')[1] ?? '')}`,
      league: String(match['league'] ?? fallback.league),
      kickoff: String(match['kickoff_utc'] ?? fallback.kickoff),
      markets: markets.map((market, marketIndex): MatchMarketOffers => {
        const marketKey = String(market['market'] ?? 'Market');
        const rawOutcomes = Array.isArray(market['outcomes']) ? (market['outcomes'] as Record<string, unknown>[]) : [];
        return {
          id: `${marketKey}-${String(market['period'] ?? 'FT')}-${String(market['line'] ?? '')}-${marketIndex}`,
          label: String(market['market_label'] ?? this.marketLabel(marketKey)),
          marketKey,
          period: String(market['period'] ?? 'FT'),
          line: market['line'] === null || market['line'] === undefined ? null : Number(market['line']),
          outcomes: rawOutcomes.map((outcome) => ({
            label: String(outcome['outcome_label'] ?? outcome['outcome'] ?? '?'),
            offers: (Array.isArray(outcome['offers']) ? (outcome['offers'] as Record<string, unknown>[]) : [])
              .map((offer) => ({
                bookmaker: String(offer['bookmaker'] ?? 'Unknown'),
                odds: Number(offer['price'] ?? 0),
                observedAt: String(offer['observed_at'] ?? ''),
                best: Boolean(offer['is_best']),
                sourceMatchId: offer['source_match_id'] === null || offer['source_match_id'] === undefined
                  ? null
                  : String(offer['source_match_id']),
              }))
              .sort((left, right) => right.odds - left.odds),
          })),
        };
      }),
    };
  }

  private previewComparison(item: BestOddsMarket): MatchComparison {
    return {
      matchId: item.matchId,
      fixture: item.fixture,
      league: item.league,
      kickoff: item.kickoff,
      markets: [{
        id: item.id,
        label: item.market,
        marketKey: item.marketKey,
        period: item.period,
        line: item.line,
        outcomes: item.selections.map((selection) => ({
          label: selection.label,
          offers: [
            { bookmaker: selection.bookmaker, odds: selection.odds, observedAt: selection.observedAt, best: true, sourceMatchId: null },
            { bookmaker: 'Druga kladionica', odds: Math.max(1.01, selection.odds - 0.12), observedAt: selection.observedAt, best: false, sourceMatchId: null },
          ],
        })),
      }],
    };
  }

  private marketLabel(rawMarket: string, _outcomeCount = 0): string {
    const normalized = rawMarket.toUpperCase();
    return ({
      'FT.1X2': 'Konačan ishod',
      'FT.DC': 'Dupla šansa',
      'FT.OU': 'Više/Manje',
      'FT.BTTS': 'Oba tima daju gol',
      'FT.2WAY': 'Pobednik',
      'FT.DNB': 'Bez nerešenog ishoda',
      'FT.OE': 'Par/Nepar',
      'FT.HANDICAP': 'Hendikep',
      'FT.CORRECT_SCORE': 'Tačan rezultat',
    } as Record<string, string>)[normalized] ?? rawMarket;
  }

  private countryForBookmaker(value: string): 'RS' | 'BA' | null {
    const bookmaker = value.trim().toLocaleLowerCase();
    const serbia = new Set([
      'admiral_rs', 'balkanbet_rs', 'ibet365_rs', 'maxbet_rs', 'meridianbet_rs',
      'merkurxtip_rs', 'mozzart_com', 'soccerbet_rs', 'volcanobet_rs',
    ]);
    const bosnia = new Set([
      'admiral', 'betlive', 'betole', 'formula_ba', 'maxbet', 'mbet', 'mdshop',
      'meridianbet', 'mozzart', 'premier', 'soccerbet', 'sportplus', 'volcanobet',
      'wwin', 'xlivebet',
    ]);
    return serbia.has(bookmaker) ? 'RS' : bosnia.has(bookmaker) ? 'BA' : null;
  }

  private toLiveState(row: Record<string, unknown>): LiveMatchState | null {
    const raw = row['live_state'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const state = raw as Record<string, unknown>;
    const clockMinute = Number(state['clock_minute']);
    if (!Number.isFinite(clockMinute)) return null;
    return {
      homeScore: String(state['home_score'] ?? ''),
      awayScore: String(state['away_score'] ?? ''),
      period: String(state['period'] ?? ''),
      clockMinute,
    };
  }

  private toBookmakers(payload: Record<string, unknown>): BookmakerHealth[] {
    const latest = (payload['latest_snapshot'] ?? {}) as Record<string, unknown>;
    const snapshots = (payload['recent_snapshot_counts'] ?? {}) as Record<string, unknown>;
    const normalized = (payload['recent_normalized_counts'] ?? {}) as Record<string, unknown>;
    const names = [...new Set([...Object.keys(latest), ...Object.keys(snapshots), ...Object.keys(normalized)])].sort();
    return names.map((name) => {
      const timestamp = Date.parse(String(latest[name] ?? ''));
      const age = Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 1000) : 86_400;
      return {
        name,
        status: age > 300 ? 'offline' : age > 45 ? 'delayed' : 'online',
        events: Number(normalized[name] ?? snapshots[name] ?? 0),
        latencyMs: 0,
        lastUpdate: age < 1 ? 'now' : age < 60 ? `${Math.round(age)}s` : `${Math.round(age / 60)}m`,
      };
    });
  }
}
