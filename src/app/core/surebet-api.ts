import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, throwError, TimeoutError, timeout } from 'rxjs';

import {
  BestOddsMarket,
  BestOddsSelection,
  BookmakerHealth,
  CollectionResponse,
  DashboardSnapshot,
  DataMode,
  MatchComparison,
  MatchMarketOffers,
  LiveMatchState,
  OddsScope,
  PageResponse,
  SurebetLeg,
  SurebetOpportunity,
} from './models';
import { PREVIEW_SNAPSHOT } from './preview-data';
import { authEnabled, runtimeConfig } from './runtime-config';

const API_ROOT = runtimeConfig.apiBaseUrl;
const LIVE_PAGE_LIMIT = 25;
const PREMATCH_PAGE_LIMIT = 12;
const LIVE_REFRESH_MS = 60_000;
const PREMATCH_REFRESH_MS = 120_000;
const EMPTY_SNAPSHOT: DashboardSnapshot = {
  bestOdds: [], opportunities: [], bookmakers: [], trend: [], liveEvents: 0, prematchEvents: 0,
};

@Injectable({ providedIn: 'root' })
export class SurebetApi {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snapshotState = signal<DashboardSnapshot>(authEnabled ? EMPTY_SNAPSHOT : PREVIEW_SNAPSHOT);
  private liveBest: BestOddsMarket[] = [];
  private prematchCurrentBest: BestOddsMarket[] = [];
  private prematchHistoryBest: BestOddsMarket[] = [];
  private liveOpportunities: SurebetOpportunity[] = [];
  private prematchOpportunities: SurebetOpportunity[] = [];
  private bookmakers: BookmakerHealth[] = [];
  private hasSuccessfulSnapshot = false;
  private consecutiveTransientFailures = 0;
  private liveEventTotal = authEnabled ? 0 : PREVIEW_SNAPSHOT.liveEvents;
  private prematchEventTotal = authEnabled ? 0 : PREVIEW_SNAPSHOT.prematchEvents;
  private prematchCurrentTotal = authEnabled ? 0 : PREVIEW_SNAPSHOT.prematchEvents;
  private prematchHistoryTotal = 0;
  private liveInFlight = false;
  private prematchInFlight = false;

  readonly snapshot = this.snapshotState.asReadonly();
  readonly mode = signal<DataMode>(authEnabled ? 'loading' : 'preview');
  readonly loading = signal(false);
  readonly prematchLoading = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  readonly lastLiveUpdated = signal<Date | null>(null);
  readonly lastPrematchUpdated = signal<Date | null>(null);
  readonly errorMessage = signal('Prijavite se za prikaz aktuelnih regionalnih kvota.');
  readonly comparison = signal<MatchComparison | null>(null);
  readonly comparisonLoading = signal(false);
  readonly comparisonError = signal('');
  readonly healthyBookmakers = computed(
    () => this.snapshot().bookmakers.filter((item) => item.status === 'online').length,
  );

  constructor() {
    // Authenticated deployments wait for Session/Auth0 to finish restoring the
    // login before making paid API calls. This avoids a visible initial 401 ->
    // demo -> live flash. Unauthenticated preview builds still load directly.
    if (!authEnabled) this.refresh('all');
    const liveTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh('live', false);
    }, LIVE_REFRESH_MS);
    const prematchTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh('prematch', false);
    }, PREMATCH_REFRESH_MS);
    this.destroyRef.onDestroy(() => {
      window.clearInterval(liveTimer);
      window.clearInterval(prematchTimer);
    });
  }

  refresh(scope: 'all' | OddsScope = 'live', foreground = true): void {
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

  private loadAll(): void {
    if (this.loading() || this.prematchLoading()) return;
    this.loading.set(true);
    this.prematchLoading.set(true);
    const liveParams = new HttpParams().set('limit', LIVE_PAGE_LIMIT);
    const prematchParams = new HttpParams().set('limit', PREMATCH_PAGE_LIMIT);
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
      prematchSurebets: this.loadPrematchSurebets(prematchParams).pipe(timeout(8000)),
      health: this.http
        .get<Record<string, unknown>>(`${API_ROOT}/bookmakers/health`)
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
          this.bookmakers = this.toBookmakers(payload.health);
          return this.combinedSnapshot();
        }),
        catchError((error: HttpErrorResponse) => {
          this.setConnectionError(error);
          return of(this.hasSuccessfulSnapshot ? null : PREVIEW_SNAPSHOT);
        }),
      )
      .subscribe((snapshot) => {
        if (snapshot) this.snapshotState.set(snapshot);
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
    const limited = new HttpParams().set('limit', LIVE_PAGE_LIMIT);
    forkJoin({
      odds: this.http.get<CollectionResponse>(`${API_ROOT}/odds/live/best`, { params: limited }).pipe(timeout(8000)),
      surebets: this.http.get<CollectionResponse>(`${API_ROOT}/surebets/live`, { params: limited }).pipe(timeout(8000)),
      health: this.http.get<Record<string, unknown>>(`${API_ROOT}/bookmakers/health`).pipe(timeout(8000)),
    }).pipe(
      map((payload) => {
        this.liveBest = payload.odds.items.flatMap((row, index) => this.toBestOddsMarkets(row, index, 'live'));
        this.liveEventTotal = payload.odds.total ?? payload.odds.count;
        this.liveOpportunities = payload.surebets.items.map((row, index) => this.toOpportunity(row, index, 'live'));
        this.bookmakers = this.toBookmakers(payload.health);
        return this.combinedSnapshot();
      }),
      catchError((error: HttpErrorResponse) => {
        this.setConnectionError(error);
        return of(null);
      }),
    ).subscribe((snapshot) => {
      if (snapshot) {
        this.snapshotState.set(snapshot);
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

  private refreshPrematch(foreground = true): void {
    if (this.prematchInFlight) return;
    this.prematchInFlight = true;
    if (foreground) this.prematchLoading.set(true);
    const limited = new HttpParams().set('limit', PREMATCH_PAGE_LIMIT);
    this.refreshPrematchSurebets(limited);
    this.http.get<CollectionResponse>(`${API_ROOT}/odds/prematch/best`, { params: limited }).pipe(
      timeout(15_000),
      map((payload) => {
        this.prematchCurrentBest = payload.items.flatMap((row, index) =>
          this.toBestOddsMarkets(row, index, 'prematch'),
        );
        this.prematchCurrentTotal = payload.total ?? payload.count;
        this.prematchEventTotal = this.prematchCurrentTotal + this.prematchHistoryTotal;
        return this.combinedSnapshot();
      }),
      catchError((error: HttpErrorResponse) => {
        this.setConnectionError(error);
        return of(null);
      }),
    ).subscribe((snapshot) => {
      if (snapshot) {
        this.snapshotState.set(snapshot);
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
      this.refreshPrematchHistory(limited);
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
      this.snapshotState.set(this.combinedSnapshot());
    });
  }

  private refreshPrematchSurebets(limited: HttpParams): void {
    this.loadPrematchSurebets(limited).pipe(
      timeout(15_000),
      catchError(() => of(null)),
    ).subscribe((payload) => {
      if (!payload) return;
      this.prematchOpportunities = payload.items.map((row, index) =>
        this.toOpportunity(row, index, 'prematch'),
      );
      this.snapshotState.set(this.combinedSnapshot());
    });
  }

  private loadPrematchSurebets(params: HttpParams): Observable<CollectionResponse> {
    return this.http.get<CollectionResponse>(`${API_ROOT}/surebets/prematch`, { params }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 404) return throwError(() => error);
        // Short deployment bridge: the current AWS image still exposes the
        // two legacy routes. This branch disappears automatically as soon as
        // the generic backend route is deployed.
        return forkJoin({
          oneXtwo: this.http.get<PageResponse>(`${API_ROOT}/surebets/prematch/1x2`, { params }),
          doubleChance: this.http.get<PageResponse>(`${API_ROOT}/surebets/prematch/dc`, { params }),
        }).pipe(map(({ oneXtwo, doubleChance }) => {
          const items = [...oneXtwo.items, ...doubleChance.items];
          return { items, count: items.length, total: items.length };
        }));
      }),
    );
  }

  openComparison(item: BestOddsMarket): void {
    this.comparison.set(null);
    this.comparisonError.set('');
    if (this.mode() === 'preview' || this.mode() === 'offline') {
      this.comparison.set(this.previewComparison(item));
      return;
    }
    this.comparisonLoading.set(true);
    const prefix = item.scope === 'prematch' ? '/prematch' : '';
    this.http
      .get<Record<string, unknown>>(`${API_ROOT}${prefix}/matches/${encodeURIComponent(item.matchId)}/odds`)
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
  }

  private combinedSnapshot(): DashboardSnapshot {
    return {
      bestOdds: [...this.liveBest, ...this.prematchCurrentBest, ...this.prematchHistoryBest],
      opportunities: [...this.liveOpportunities, ...this.prematchOpportunities]
        .sort((left, right) => right.roi - left.roi),
      bookmakers: this.bookmakers,
      trend: [],
      liveEvents: this.liveEventTotal,
      prematchEvents: this.prematchEventTotal,
    };
  }

  private setConnectionError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : null;
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
    const legs: SurebetLeg[] = rawLegs.map((leg) => ({
      label: String(leg['outcome'] ?? '?'),
      bookmaker: String(leg['bookmaker'] ?? 'Unknown'),
      odds: Number(leg['price'] ?? 0),
      country: this.countryForBookmaker(String(leg['bookmaker'] ?? '')),
    }));
    if (!legs.length) {
      const candidates: [string, string, string][] = fallbackMarket === 'DC'
        ? [[String(row['pair'] ?? 'DC'), 'best_dc_src', 'best_dc'], ['Opposite', 'best_so_src', 'best_so']]
        : [['1', 'src_1', 'best_1'], ['X', 'src_X', 'best_X'], ['2', 'src_2', 'best_2']];
      for (const [label, sourceKey, oddsKey] of candidates) {
        const odds = Number(row[oddsKey]);
        if (Number.isFinite(odds) && odds > 1) {
          const bookmaker = String(row[sourceKey] ?? 'Unknown');
          legs.push({ label, bookmaker, odds, country: this.countryForBookmaker(bookmaker) });
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
      fixture: `${String(row['home'] ?? 'Home')} — ${String(row['away'] ?? 'Away')}`,
      league: String(row['league'] ?? 'Unknown league'),
      kickoff: String(row['kickoff_utc'] ?? ''),
      roi: Number.isFinite(roi) ? roi : 0,
      profit: Number.isFinite(roi) ? roi * 10 : 0,
      ageSeconds,
      legs,
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
            { bookmaker: selection.bookmaker, odds: selection.odds, observedAt: selection.observedAt, best: true },
            { bookmaker: 'Druga kladionica', odds: Math.max(1.01, selection.odds - 0.12), observedAt: selection.observedAt, best: false },
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
