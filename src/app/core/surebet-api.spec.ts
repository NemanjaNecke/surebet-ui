import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SurebetApi } from './surebet-api';

describe('SurebetApi', () => {
  it('combines live and prematch odds and surebets', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
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
    const prematchRequest = http.expectOne((request) =>
      request.url.endsWith('/odds/prematch/best') && !request.params.has('include_history'));
    expect(prematchRequest.request.params.get('limit')).toBe('12');
    prematchRequest.flush({ count: 1, total: 1834, items: [{ ...bestMatch, match_id: 'match-2' }] });
    const historyRequest = http.expectOne((request) =>
      request.url.endsWith('/odds/prematch/best') && request.params.get('history_only') === 'true');
    expect(historyRequest.request.params.get('include_history')).toBe('true');
    expect(historyRequest.request.params.get('history_hours')).toBe('168');
    historyRequest.flush({ count: 0, total: 12, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 1, items: [{
      match_id: 'match-1', market: 'FT.1X2', home: 'Home', away: 'Away', league: 'League',
      kickoff_utc: now, roi: 0.05, legs: [
        { outcome: '1', bookmaker: 'Alpha', price: 3.1, observed_at: now },
        { outcome: 'X', bookmaker: 'Beta', price: 3.5, observed_at: now },
        { outcome: '2', bookmaker: 'Gamma', price: 2.8, observed_at: now },
      ],
    }] });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch')).flush({
      count: 2,
      items: [
        { match_id: 'match-2', market: 'FT.1X2', home: 'Home', away: 'Away', roi: 0.04, kickoff_utc: now, legs: [
          { outcome: '1', bookmaker: 'Alpha', price: 3, observed_at: now },
          { outcome: 'X', bookmaker: 'Beta', price: 3.6, observed_at: now },
          { outcome: '2', bookmaker: 'Gamma', price: 2.9, observed_at: now },
        ] },
        { match_id: 'match-3', market: 'FT.DC', pair: '1X vs 2', home: 'Third', away: 'Match', roi: 0.03, kickoff_utc: now, legs: [
          { outcome: '1X', bookmaker: 'admiral_rs', price: 1.9, observed_at: now },
          { outcome: '2', bookmaker: 'mozzart', price: 2.2, observed_at: now },
        ] },
      ],
    });
    http.expectOne((request) => request.url.endsWith('/bookmakers/health')).flush({ latest_snapshot: { Alpha: now }, recent_normalized_counts: { Alpha: 18 } });
    http.expectOne((request) => request.url.endsWith('/bookmakers')).flush({ items: [] });

    expect(api.mode()).toBe('live');
    expect(api.snapshot().bestOdds).toHaveLength(2);
    expect(api.snapshot().bestOdds[1].scope).toBe('prematch');
    expect(api.snapshot().opportunities).toHaveLength(3);
    expect(api.snapshot().opportunities[0].roi).toBe(5);
    expect(api.snapshot().opportunities[1].roi).toBe(4);
    expect(api.snapshot().opportunities[2]).toMatchObject({
      kind: 'cross-market', pair: '1X vs 2', market: 'Dupla šansa',
    });
    expect(api.snapshot().opportunities[0].kind).toBe('same-market');
    expect(api.snapshot().bookmakers[0].events).toBe(18);
    expect(api.snapshot().liveEvents).toBe(907);
    expect(api.snapshot().prematchEvents).toBe(1846);

    api.refresh('live');
    http.expectOne((request) => request.url.endsWith('/odds/live/best')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 0, items: [] });
    http.expectNone((request) => request.url.endsWith('/bookmakers/health'));
    http.expectNone((request) => request.url.endsWith('/bookmakers'));
    http.expectNone((request) => request.url.includes('/odds/prematch/') || request.url.includes('/surebets/prematch/'));
    expect(api.snapshot().bestOdds.filter((item) => item.scope === 'prematch')).toHaveLength(1);
    expect(api.snapshot().opportunities.filter((item) => item.scope === 'prematch')).toHaveLength(2);
    http.verify();
  });

  it('keeps the last snapshot seamless before marking repeated failures stale', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(SurebetApi);
    const http = TestBed.inject(HttpTestingController);

    http.expectOne((request) => request.url.endsWith('/odds/live/best')).flush({ count: 0, items: [] });
    http.expectOne((request) =>
      request.url.endsWith('/odds/prematch/best') && !request.params.has('include_history'))
      .flush({ count: 0, items: [] });
    http.expectOne((request) =>
      request.url.endsWith('/odds/prematch/best') && request.params.get('history_only') === 'true')
      .flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 0, items: [] });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch')).flush(
      {}, { status: 404, statusText: 'Not Found' },
    );
    http.expectOne((request) => request.url.endsWith('/surebets/prematch/1x2')).flush({
      items: [], pagination: { limit: 50, offset: 0, count: 0, total: 0 },
    });
    http.expectOne((request) => request.url.endsWith('/surebets/prematch/dc')).flush({
      items: [], pagination: { limit: 50, offset: 0, count: 0, total: 0 },
    });
    http.expectOne((request) => request.url.endsWith('/bookmakers/health')).flush({});
    http.expectOne((request) => request.url.endsWith('/bookmakers')).flush({ items: [] });
    expect(api.mode()).toBe('live');
    const lastSuccessfulSnapshot = api.snapshot();

    const failLiveRefresh = () => {
      api.refresh('live');
      http.expectOne((request) => request.url.endsWith('/surebets/live')).flush({ count: 0, items: [] });
      http.expectNone((request) => request.url.endsWith('/bookmakers/health'));
      http.expectNone((request) => request.url.endsWith('/bookmakers'));
      http.expectOne((request) => request.url.endsWith('/odds/live/best')).error(
        new ProgressEvent('network error'),
      );
    };

    failLiveRefresh();
    expect(api.mode()).toBe('live');
    failLiveRefresh();
    expect(api.mode()).toBe('live');
    failLiveRefresh();

    expect(api.mode()).toBe('stale');
    expect(api.snapshot()).toStrictEqual(lastSuccessfulSnapshot);
    expect(api.errorMessage()).toContain('poslednji uspešno učitani podaci');
    http.verify({ ignoreCancelled: true });
  });
});
