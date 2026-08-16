import { DashboardSnapshot } from './models';

const now = () => new Date().toISOString();

export const PREVIEW_SNAPSHOT: DashboardSnapshot = {
  liveEvents: 2,
  prematchEvents: 1,
  bestOdds: [
    {
      id: 'preview-odds-1', matchId: 'preview-match-1', sport: 'Football', market: '1X2',
      marketKey: 'FT.1X2', period: 'FT', line: null, scope: 'live',
      fixture: 'Partizan — Crvena zvezda', league: 'Serbia · SuperLiga',
      kickoff: new Date(Date.now() + 18 * 60_000).toISOString(), ageSeconds: 3,
      selections: [
        { label: '1', bookmaker: 'Mozzart', odds: 3.05, observedAt: now() },
        { label: 'X', bookmaker: 'MaxBet', odds: 3.7, observedAt: now() },
        { label: '2', bookmaker: 'Admiral', odds: 2.65, observedAt: now() },
      ],
    },
    {
      id: 'preview-odds-2', matchId: 'preview-match-2', sport: 'Basketball', market: '2-Way',
      marketKey: 'FT.MONEYLINE', period: 'FT', line: null, scope: 'prematch',
      fixture: 'Budućnost — Borac Banja Luka', league: 'Adriatic League',
      kickoff: new Date(Date.now() + 63 * 60_000).toISOString(), ageSeconds: 6,
      selections: [
        { label: '1', bookmaker: 'Volcano', odds: 2.12, observedAt: now() },
        { label: '2', bookmaker: 'WWin', odds: 2.08, observedAt: now() },
      ],
    },
    {
      id: 'preview-odds-3', matchId: 'preview-match-3', sport: 'Football', market: 'O/U',
      marketKey: 'FT.OU', period: 'FT', line: 2.5, scope: 'live',
      fixture: 'Novi Pazar — Vojvodina', league: 'Serbia · SuperLiga',
      kickoff: new Date(Date.now() + 41 * 60_000).toISOString(), ageSeconds: 9,
      selections: [
        { label: 'OVER', bookmaker: 'SoccerBet', odds: 2.06, observedAt: now() },
        { label: 'UNDER', bookmaker: 'Meridian', odds: 1.91, observedAt: now() },
      ],
    },
  ],
  opportunities: [
    {
      id: 'preview-1', kind: 'same-market', pair: null, market: '1X2', scope: 'live', fixture: 'Partizan — Crvena zvezda',
      league: 'Serbia · SuperLiga', kickoff: new Date(Date.now() + 18 * 60_000).toISOString(),
      roi: 6.42, profit: 64.2, ageSeconds: 4,
      legs: [
        { label: '1', bookmaker: 'Mozzart', odds: 3.05 },
        { label: 'X', bookmaker: 'MaxBet', odds: 3.7 },
        { label: '2', bookmaker: 'Admiral', odds: 2.65 },
      ],
    },
    {
      id: 'preview-2', kind: 'cross-market', pair: '1X vs 2', market: 'DC', scope: 'prematch', fixture: 'Novi Pazar — Vojvodina',
      league: 'Serbia · SuperLiga', kickoff: new Date(Date.now() + 41 * 60_000).toISOString(),
      roi: 4.87, profit: 48.7, ageSeconds: 7,
      legs: [
        { label: '1X', bookmaker: 'SoccerBet', odds: 1.93 },
        { label: '2', bookmaker: 'Meridian', odds: 2.25 },
      ],
    },
    {
      id: 'preview-3', kind: 'same-market', pair: null, market: '2-Way', scope: 'prematch', fixture: 'Budućnost — Borac Banja Luka',
      league: 'Adriatic League', kickoff: new Date(Date.now() + 63 * 60_000).toISOString(),
      roi: 3.91, profit: 39.1, ageSeconds: 11,
      legs: [
        { label: '1', bookmaker: 'Volcano', odds: 2.12 },
        { label: '2', bookmaker: 'WWin', odds: 2.08 },
      ],
    },
  ],
  bookmakers: [
    { name: 'Mozzart', status: 'online', events: 324, latencyMs: 0, lastUpdate: '2s' },
    { name: 'MaxBet', status: 'online', events: 288, latencyMs: 0, lastUpdate: '3s' },
    { name: 'SoccerBet', status: 'online', events: 271, latencyMs: 0, lastUpdate: '2s' },
    { name: 'Admiral', status: 'online', events: 248, latencyMs: 0, lastUpdate: '4s' },
    { name: 'Meridian', status: 'delayed', events: 207, latencyMs: 0, lastUpdate: '18s' },
  ],
  trend: [],
};
