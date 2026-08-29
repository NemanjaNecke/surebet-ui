export type DataMode = 'loading' | 'live' | 'stale' | 'preview' | 'offline';
export type OddsScope = 'live' | 'prematch';
export type SurebetKind = 'same-market' | 'cross-market';

export interface LiveMatchState {
  homeScore: string;
  awayScore: string;
  period: string;
  clockMinute: number;
}

export interface SurebetLeg {
  label: string;
  bookmaker: string;
  odds: number;
  country?: 'RS' | 'BA' | null;
}

export interface SurebetOpportunity {
  id: string;
  kind: SurebetKind;
  pair: string | null;
  market: string;
  fixture: string;
  league: string;
  kickoff: string;
  roi: number;
  profit: number;
  ageSeconds: number;
  legs: SurebetLeg[];
  scope: OddsScope;
  liveState: LiveMatchState | null;
}

export interface BestOddsSelection {
  label: string;
  bookmaker: string;
  odds: number;
  observedAt: string;
}

export interface BestOddsMarket {
  id: string;
  matchId: string;
  sport: string;
  market: string;
  marketKey: string;
  period: string;
  line: number | null;
  fixture: string;
  league: string;
  kickoff: string;
  ageSeconds: number;
  selections: BestOddsSelection[];
  scope: OddsScope;
  historical: boolean;
  liveState: LiveMatchState | null;
}

export interface MatchOffer {
  bookmaker: string;
  odds: number;
  observedAt: string;
  best: boolean;
}

export interface MatchOutcomeOffers {
  label: string;
  offers: MatchOffer[];
}

export interface MatchMarketOffers {
  id: string;
  label: string;
  marketKey: string;
  period: string;
  line: number | null;
  outcomes: MatchOutcomeOffers[];
}

export interface MatchComparison {
  matchId: string;
  fixture: string;
  league: string;
  kickoff: string;
  markets: MatchMarketOffers[];
}

export interface BookmakerHealth {
  name: string;
  status: 'online' | 'delayed' | 'offline';
  events: number;
  latencyMs: number;
  lastUpdate: string;
}

export interface BookmakerOption {
  key: string;
  name: string;
  country: 'RS' | 'BA' | '';
  permitted?: boolean;
}

export interface AccountProfile {
  subject: string;
  email: string | null;
  display_name: string | null;
  entitlement: {
    active: boolean;
    admin: boolean;
    enabled: boolean;
    status: string | null;
    plan_code: string | null;
    current_period_end: string | null;
  };
  all_bookmakers: boolean;
  bookmakers: string[];
}

export interface AdminUser {
  subject: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  is_enabled: boolean;
  all_bookmakers: boolean;
  bookmakers: string[];
  created_at: string;
  last_seen_at: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface DashboardSnapshot {
  opportunities: SurebetOpportunity[];
  bestOdds: BestOddsMarket[];
  bookmakers: BookmakerHealth[];
  trend: TrendPoint[];
  liveEvents: number;
  prematchEvents: number;
}

export interface PageResponse<T = Record<string, unknown>> {
  items: T[];
  pagination: { limit: number; offset: number; count: number; total: number };
}

export interface CollectionResponse<T = Record<string, unknown>> {
  items: T[];
  count: number;
  total?: number | null;
}

export interface RealtimeTicketResponse {
  ticket: string;
  expires_at: string;
  websocket_path: string;
}
