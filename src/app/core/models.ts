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
  line: number | null;
  country?: 'RS' | 'BA' | null;
}

export interface SurebetOpportunity {
  id: string;
  kind: SurebetKind;
  pair: string | null;
  market: string;
  period: string;
  line: number | null;
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

export interface ValueBetOpportunity {
  id: string;
  matchId: string;
  sport: string;
  fixture: string;
  league: string;
  kickoff: string;
  market: string;
  period: string;
  line: number | null;
  outcome: string;
  bookmaker: string;
  odds: number;
  fairOdds: number;
  fairProbability: number;
  expectedValue: number;
  referenceBookmakers: number;
  ageSeconds: number;
}

export interface MiddleBetOpportunity {
  id: string;
  matchId: string;
  sport: string;
  fixture: string;
  league: string;
  kickoff: string;
  market: string;
  period: string;
  gap: number;
  hitRoi: number;
  missRoi: number;
  ageSeconds: number;
  legs: SurebetLeg[];
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
  sourceMatchId?: string | null;
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

export interface TeamRecentMatch {
  id: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  winner: 'home' | 'away' | null;
  kickoff_utc: string | null;
}

export interface TeamStanding {
  position: number | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  goals_for: number | null;
  goals_against: number | null;
  goal_difference: number | null;
  points: number | null;
}

export interface TeamStatisticsSide {
  id: string;
  name: string;
  short_name: string;
  manager: string | null;
  standing: TeamStanding | null;
  last_five: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    goals_against: number;
    form: Array<'W' | 'D' | 'L'>;
    recent: TeamRecentMatch[];
  };
}

export interface MatchTeamStatistics {
  provider: string;
  sport?: string;
  updated_at: string;
  source_match_id: string;
  provider_match_id: string;
  competition: string;
  season: string | null;
  round: number | null;
  stadium: { name: string | null; city: string | null; capacity: string | null } | null;
  teams: { home: TeamStatisticsSide; away: TeamStatisticsSide };
  head_to_head: TeamRecentMatch[];
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
  valuebets: ValueBetOpportunity[];
  middlebets: MiddleBetOpportunity[];
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

export type PromotionCategory = 'sport' | 'casino' | 'welcome' | 'other';

export interface PromotionItem {
  id: string;
  bookmaker: string;
  bookmaker_name: string;
  country: 'RS' | 'BA';
  title: string;
  summary: string;
  category: PromotionCategory;
  image_url: string | null;
  target_url: string;
  starts_at: string | null;
  ends_at: string | null;
  fetched_at: string;
}

export interface PromotionSource {
  bookmaker: string;
  status: 'online' | 'unavailable';
  count: number;
}

export interface PromotionFeed {
  items: PromotionItem[];
  count: number;
  sources: PromotionSource[];
  disclaimer: string;
}
