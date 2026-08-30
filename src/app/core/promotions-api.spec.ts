import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PromotionsApi } from './promotions-api';

describe('PromotionsApi', () => {
  it('loads the selected countries and retains publisher fields', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(PromotionsApi);
    const http = TestBed.inject(HttpTestingController);

    api.load(['RS']);
    const request = http.expectOne((candidate) => candidate.url.endsWith('/promotions'));
    expect(request.request.params.get('countries')).toBe('RS');
    request.flush({
      count: 1,
      disclaimer: 'Proverite uslove.',
      sources: [{ bookmaker: 'balkanbet_rs', status: 'online', count: 1 }],
      items: [{
        id: 'promo-1', bookmaker: 'balkanbet_rs', bookmaker_name: 'BalkanBet RS', country: 'RS',
        title: 'Bonus dobrodošlice', summary: 'Podaci kladionice.', category: 'welcome',
        image_url: 'https://example.com/promo.jpg', target_url: 'https://example.com/promo',
        starts_at: null, ends_at: null, fetched_at: new Date().toISOString(),
      }],
    });

    expect(api.items()[0]).toMatchObject({ title: 'Bonus dobrodošlice', country: 'RS' });
    expect(api.sources()[0].count).toBe(1);
    expect(api.disclaimer()).toBe('Proverite uslove.');
    http.verify();
  });
});
