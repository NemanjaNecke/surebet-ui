import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { PREVIEW_SNAPSHOT } from '../../core/preview-data';
import { RealtimeUpdates } from '../../core/realtime-updates';
import { Session } from '../../core/session';
import { SurebetApi } from '../../core/surebet-api';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  const snapshot = signal(PREVIEW_SNAPSHOT);
  const api = {
    snapshot,
    mode: signal<'preview' | 'live' | 'stale'>('preview'), loading: signal(false), prematchLoading: signal(false),
    lastUpdated: signal(new Date('2026-08-15T12:00:00Z')),
    lastLiveUpdated: signal(new Date('2026-08-15T12:00:00Z')),
    lastPrematchUpdated: signal(new Date('2026-08-15T11:00:00Z')),
    errorMessage: signal('Demo podaci'),
    comparison: signal(null), comparisonLoading: signal(false), comparisonError: signal(''),
    healthyBookmakers: computed(() => snapshot().bookmakers.filter((item) => item.status === 'online').length),
    refresh: vi.fn(), openComparison: vi.fn(), closeComparison: vi.fn(),
  };
  const session = {
    enabled: false, authenticated: signal(false), user: signal(null), login: vi.fn(), logout: vi.fn(),
  };

  beforeEach(async () => {
    api.mode.set('preview');
    api.errorMessage.set('Demo podaci');
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        { provide: SurebetApi, useValue: api },
        { provide: Session, useValue: session },
        { provide: RealtimeUpdates, useValue: { connected: signal(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
  });

  it('marks non-live information as preview data', () => {
    expect(fixture.nativeElement.querySelector('.preview-banner')?.textContent).toContain('Demo podaci');
    expect(fixture.nativeElement.querySelectorAll('.event-card')).toHaveLength(3);
  });

  it('labels retained data as stale instead of demo data', () => {
    api.mode.set('stale');
    api.errorMessage.set('Prikazani su poslednji uspešno učitani podaci.');
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.preview-banner')?.textContent;
    expect(banner).toContain('Privremeni zastoj');
    expect(banner).not.toContain('Demo podaci');
  });

  it('filters surebets by market', () => {
    fixture.componentInstance.marketView.set('surebets');
    fixture.componentInstance.market.set('DC');
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.surebet-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Novi Pazar');
    expect(cards[0].classList).toContain('cross-market');
    expect(cards[0].textContent).toContain('CROSS-MARKET');
    expect(cards[0].textContent).toContain('1X vs 2');
  });

  it('separates same-market and cross-market opportunities', () => {
    fixture.componentInstance.marketView.set('surebets');
    fixture.componentInstance.setOpportunityKind('same-market');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.surebet-card')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('ISTO TRŽIŠTE');

    fixture.componentInstance.setOpportunityKind('cross-market');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.surebet-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.surebet-card')?.textContent).toContain('CROSS-MARKET');
  });

  it('refreshes all data from the all scope and prematch when selected', () => {
    api.refresh.mockClear();
    fixture.componentInstance.refreshCurrent();
    expect(api.refresh).toHaveBeenCalledWith('all');

    api.refresh.mockClear();
    fixture.componentInstance.setScope('prematch');
    expect(api.refresh).toHaveBeenCalledWith('prematch');
  });

  it('filters the best odds board and opens comparisons', () => {
    fixture.componentInstance.market.set('O/U');
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.event-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('2.06');
    fixture.componentInstance.openComparison(PREVIEW_SNAPSHOT.bestOdds[0]);
    expect(api.openComparison).toHaveBeenCalled();
  });

  it('keeps live and prematch filters isolated and paginates results', () => {
    fixture.componentInstance.setScope('prematch');
    fixture.componentInstance.setPageSize('1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.event-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.event-card')?.textContent).toContain('PRE MEČA');
    expect(fixture.componentInstance.totalPages()).toBe(1);

    fixture.componentInstance.setScope('live');
    fixture.detectChanges();
    expect(fixture.componentInstance.totalPages()).toBe(2);
    expect(fixture.nativeElement.querySelector('.event-card')?.textContent).toContain('UŽIVO');
    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expect(fixture.componentInstance.page()).toBe(2);
  });

  it('offers indexed search suggestions', () => {
    fixture.componentInstance.searchInput.set('Part');
    expect(fixture.componentInstance.suggestions()[0].label).toBe('Partizan');
  });
});
