import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { PREVIEW_SNAPSHOT } from '../../core/preview-data';
import { RealtimeUpdates } from '../../core/realtime-updates';
import { Session } from '../../core/session';
import { SurebetApi } from '../../core/surebet-api';
import { TeamLogos } from '../../core/team-logos';
import { Dashboard } from './dashboard';
import { Account } from '../../core/account';

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
    bookmakerCatalog: signal([]), prematchTotal: signal(1),
    healthyBookmakers: computed(() => snapshot().bookmakers.filter((item) => item.status === 'online').length),
    refresh: vi.fn(), setPrematchQuery: vi.fn(), openComparison: vi.fn(), closeComparison: vi.fn(),
  };
  const sessionEnabled = signal(false);
  const session = {
    get enabled() { return sessionEnabled(); },
    authenticated: signal(false), loading: signal(false), user: signal(null), login: vi.fn(), logout: vi.fn(),
  };
  const account = { profile: signal(null) };

  beforeEach(async () => {
    snapshot.set(PREVIEW_SNAPSHOT);
    api.mode.set('preview');
    api.errorMessage.set('Demo podaci');
    sessionEnabled.set(false);
    session.authenticated.set(false);
    session.loading.set(false);
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        { provide: SurebetApi, useValue: api },
        { provide: Session, useValue: session },
        { provide: Account, useValue: account },
        { provide: RealtimeUpdates, useValue: { connected: signal(false) } },
        { provide: TeamLogos, useValue: { url: vi.fn(() => null) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
  });

  it('marks non-live information as preview data', () => {
    expect(fixture.nativeElement.querySelector('.preview-banner')?.textContent).toContain('Demo podaci');
    expect(fixture.nativeElement.querySelectorAll('.event-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.event-card time')?.textContent).toContain('1:0');
  });

  it('shows the connected bookmaker health total instead of the current page subset', () => {
    const expected = String(snapshot().bookmakers.filter((item) => item.status !== 'offline').length);
    expect(fixture.nativeElement.querySelector('.pulse-number')?.textContent?.trim()).toBe(expected);
  });

  it('never renders a false logged-out action while the session is restoring', () => {
    sessionEnabled.set(true);
    session.loading.set(true);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('.header-actions')?.textContent ?? '';
    expect(header).toContain('Provera naloga');
    expect(header).not.toContain('Registracija');

    session.loading.set(false);
    session.authenticated.set(true);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.header-actions')?.textContent).toContain('Odjava');
  });

  it('marks retained prematch games as history', () => {
    fixture.componentInstance.setScope('prematch');
    fixture.componentInstance.setTimeWindow('all');
    snapshot.set({
      ...PREVIEW_SNAPSHOT,
      bestOdds: PREVIEW_SNAPSHOT.bestOdds.map((item, index) =>
        index === 1 ? { ...item, historical: true } : item,
      ),
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ISTORIJA');
    expect(fixture.nativeElement.textContent).toContain('Sačuvani istorijski snapshot');
  });

  it('labels retained data as stale instead of demo data', () => {
    api.mode.set('stale');
    api.errorMessage.set('Prikazani su poslednji uspešno učitani podaci.');
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.preview-banner')?.textContent;
    expect(banner).toContain('Privremeni zastoj');
    expect(banner).not.toContain('Demo podaci');
  });

  it('retries stale data automatically without a manual refresh control', () => {
    sessionEnabled.set(true);
    session.authenticated.set(true);
    api.mode.set('stale');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.preview-banner')?.textContent ?? '';
    expect(banner).toContain('Automatski ponovni pokušaj');
    expect(fixture.nativeElement.textContent).not.toContain('Osveži sada');
    expect(fixture.nativeElement.textContent).not.toContain('Pokušaj ponovo');
  });

  it('filters surebets by market', () => {
    fixture.componentInstance.marketView.set('surebets');
    fixture.componentInstance.setScope('prematch');
    fixture.componentInstance.setTimeWindow('all');
    fixture.componentInstance.market.set('DC');
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.surebet-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Novi Pazar');
    expect(cards[0].classList).toContain('cross-market');
    expect(cards[0].textContent).toContain('CROSS-MARKET');
    expect(cards[0].textContent).toContain('1X vs 2');
  });

  it('shows the filtered result count in every surebet badge', () => {
    fixture.componentInstance.marketView.set('surebets');
    fixture.componentInstance.setScope('prematch');
    fixture.componentInstance.setOpportunityKind('cross-market');
    fixture.detectChanges();

    const expected = String(fixture.componentInstance.opportunities().length);
    const headerBadge = fixture.nativeElement.querySelector('header nav button.active span');
    const boardBadge = fixture.nativeElement.querySelector('.view-tabs button.active span');
    const resultCount = fixture.nativeElement.querySelector('.result-summary strong');
    expect(headerBadge?.textContent?.trim()).toBe(expected);
    expect(boardBadge?.textContent?.trim()).toBe(expected);
    expect(resultCount?.textContent?.trim()).toBe(expected);
  });

  it('separates same-market and cross-market opportunities', () => {
    fixture.componentInstance.marketView.set('surebets');
    fixture.componentInstance.setScope('prematch');
    fixture.componentInstance.setTimeWindow('all');
    fixture.componentInstance.setOpportunityKind('same-market');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.surebet-card')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('ISTA DRŽAVA');

    fixture.componentInstance.setOpportunityKind('cross-market');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.surebet-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.surebet-card')?.textContent).toContain('CROSS-MARKET');
  });

  it('loads prematch data when prematch is selected', () => {
    api.refresh.mockClear();
    fixture.componentInstance.setScope('prematch');
    expect(api.refresh).toHaveBeenCalledWith('prematch');
  });

  it('filters the best odds board and opens comparisons', () => {
    fixture.componentInstance.market.set('FT.OU');
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.event-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('2.06');
    fixture.componentInstance.openComparison(PREVIEW_SNAPSHOT.bestOdds[0]);
    expect(api.openComparison).toHaveBeenCalled();
  });

  it('keeps the full market catalog in one compact selector', () => {
    const select = fixture.nativeElement.querySelector('.market-select select') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toContain('FT.OU');

    select.value = 'FT.OU';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.market()).toBe('FT.OU');
    expect(fixture.nativeElement.querySelectorAll('.event-card')).toHaveLength(1);
  });

  it('renders every dashboard filter as a compact dropdown', () => {
    fixture.componentInstance.setScope('prematch');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sport-section select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.bookmaker-section select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.time-section select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.filters .filter-buttons')).toBeNull();
  });

  it('keeps live and prematch filters isolated and paginates results', () => {
    fixture.componentInstance.setScope('prematch');
    fixture.componentInstance.setTimeWindow('all');
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
