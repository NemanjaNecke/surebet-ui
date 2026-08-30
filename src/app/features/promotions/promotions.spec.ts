import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { Account } from '../../core/account';
import { PromotionsApi } from '../../core/promotions-api';
import { Session } from '../../core/session';
import { Promotions } from './promotions';

describe('Promotions', () => {
  let fixture: ComponentFixture<Promotions>;
  const api = {
    items: signal([{ id: 'rs-1', bookmaker: 'balkanbet_rs', bookmaker_name: 'BalkanBet RS', country: 'RS' as const,
      title: 'Sportski freebet', summary: 'Originalna promocija.', category: 'sport' as const,
      image_url: null, target_url: 'https://example.com/rs', starts_at: null, ends_at: null, fetched_at: '' },
    { id: 'ba-1', bookmaker: 'mozzart', bookmaker_name: 'Mozzart', country: 'BA' as const,
      title: 'Kazino spinovi', summary: 'Originalna promocija.', category: 'casino' as const,
      image_url: null, target_url: 'https://example.com/ba', starts_at: null, ends_at: null, fetched_at: '' }]),
    sources: signal([{ bookmaker: 'balkanbet_rs', status: 'online' as const, count: 1 },
      { bookmaker: 'mozzart', status: 'online' as const, count: 1 }]),
    disclaimer: signal('Promocije prenose kladionice.'), loading: signal(false), error: signal(''), load: vi.fn(),
  };

  beforeEach(async () => {
    api.load.mockClear();
    await TestBed.configureTestingModule({
      imports: [Promotions],
      providers: [
        provideRouter([]),
        { provide: PromotionsApi, useValue: api },
        { provide: Session, useValue: { authenticated: signal(true), logout: vi.fn() } },
        { provide: Account, useValue: { profile: signal(null) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Promotions);
    fixture.detectChanges();
  });

  it('shows publisher promotions without ranking them', () => {
    expect(fixture.nativeElement.querySelectorAll('.promotion-grid article')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Ne rangiramo i ne upoređujemo');
    expect(fixture.nativeElement.textContent).toContain('🇷🇸');
    expect(fixture.nativeElement.textContent).toContain('🇧🇦');
  });

  it('supports Serbia, Bosnia or both while preventing an empty selection', () => {
    const controls = fixture.nativeElement.querySelectorAll('.country-filter input') as NodeListOf<HTMLInputElement>;
    controls[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.promotion-grid article')).toHaveLength(1);
    expect(api.load).toHaveBeenCalledWith(['RS']);

    controls[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected('RS')).toBe(true);
  });
});
