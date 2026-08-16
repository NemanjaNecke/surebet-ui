import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SurebetApi } from './surebet-api';

describe('SurebetApi', () => {
  it('combines live and prematch odds and surebets', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(SurebetApi);
    const http = TestBed.inject(HttpTestingController);
    const now = new Date().toISOString();
    const bestMatch = {
      match_id: 'match-1', sport: 'football', home: 'Home', away: 'Away', league: 'League',
      kickoff_utc: now, updated_at: now,
      markets: [{ market: 'FT.1X2', period: 'FT', line: null, outcomes: [
        { outcome: '1', bookmaker: 'Alpha', price: 3.1, observed_at: now },
        { outcome: 'X', bookmaker: 'Beta', price: 3.5, observed_at: now },
        { outcome: '2', bookmaker: 'Gamma', price: 2.8, observed_at: now },
      ] }],
    };

    http.expectOne((request) => request.url.endsWith('/odds/live/best')).flush({ count: 1, total: 907, items: [bestMatch] });
    http.expectOne((request) => request.url.endsWith('/odds/prematch/best')).flush({ count: 1, total: 1834, items: [{ ...bestMatch, match_id: 'match-2' }] });
    http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 1, items: [{
      match_id: 'match-1', market: 'FT.1X2', home: 'Home', away: 'Away', league: 'League',
      kickoff_utc: now, roi: 0.05, legs: [
        { outcome: '1', bookmaker: 'Alpha', price: 3.1, observed_at: now },
        { outcome: 'X', bookmaker: 'Beta', price: 3.5, observed_at: now },
        { outcome: '2', bookmaker: 'Gamma', price: 2.8, observed_at: now },
      ],
    }] });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch/1x2')).flush({
      items: [{ canon_key: 'match-2', home: 'Home', away: 'Away', ROI: 0.04, best_1: 3, best_X: 3.6, best_2: 2.9, src_1: 'Alpha', src_X: 'Beta', src_2: 'Gamma', computed_at: now }],
      pagination: { limit: 100, offset: 0, count: 1, total: 1 },
    });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch/dc')).flush({
      items: [{ canon_key: 'match-3', pair: '1X vs 2', home: 'Third', away: 'Match', ROI: 0.03, best_dc: 1.9, best_so: 2.2, best_dc_src: 'Alpha', best_so_src: 'Gamma', computed_at: now }],
      pagination: { limit: 100, offset: 0, count: 1, total: 1 },
    });
    http.expectOne((request) => request.url.endsWith('/bookmakers/health')).flush({ latest_snapshot: { Alpha: now }, recent_normalized_counts: { Alpha: 18 } });

    expect(api.mode()).toBe('live');
    expect(api.snapshot().bestOdds).toHaveLength(2);
    expect(api.snapshot().bestOdds[1].scope).toBe('prematch');
    expect(api.snapshot().opportunities).toHaveLength(3);
    expect(api.snapshot().opportunities[0].roi).toBe(5);
    expect(api.snapshot().opportunities[1].roi).toBe(4);
    expect(api.snapshot().opportunities[2]).toMatchObject({
      kind: 'cross-market', pair: '1X vs 2', market: 'DC',
    });
    expect(api.snapshot().opportunities[0].kind).toBe('same-market');
    expect(api.snapshot().bookmakers[0].events).toBe(18);
    expect(api.snapshot().liveEvents).toBe(907);
    expect(api.snapshot().prematchEvents).toBe(1834);

    api.refresh('live');
    http.expectOne((request) => request.url.endsWith('/odds/live/best')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/bookmakers/health')).flush({});
    http.expectNone((request) => request.url.includes('/odds/prematch/') || request.url.includes('/surebets/prematch/'));
    expect(api.snapshot().bestOdds.filter((item) => item.scope === 'prematch')).toHaveLength(1);
    expect(api.snapshot().opportunities.filter((item) => item.scope === 'prematch')).toHaveLength(2);
    http.verify();
  });

  it('keeps the last snapshot but reports offline when a live refresh fails', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(SurebetApi);
    const http = TestBed.inject(HttpTestingController);

    http.expectOne((request) => request.url.endsWith('/odds/live/best')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/odds/prematch/best')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch/1x2')).flush({
      items: [], pagination: { limit: 250, offset: 0, count: 0, total: 0 },
    });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch/dc')).flush({
      items: [], pagination: { limit: 250, offset: 0, count: 0, total: 0 },
    });
    http.expectOne((request) => request.url.endsWith('/bookmakers/health')).flush({});
    expect(api.mode()).toBe('live');

    api.refresh('live');
    http.expectOne((request) => request.url.endsWith('/odds/live/best')).error(
      new ProgressEvent('network error'),
    );

    expect(api.mode()).toBe('offline');
    expect(api.errorMessage()).toContain('nije dostupan');
    http.verify({ ignoreCancelled: true });
  });
});
