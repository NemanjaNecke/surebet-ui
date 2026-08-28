import { Injectable, signal } from '@angular/core';

const IBET365_ICON_ROOT = 'https://ibet-365.com/content/club-icons';
const CAPTURED_ICON_INDEX = '/team-logo-index.json';
const LIVE_ICON_INDEX = `${IBET365_ICON_ROOT}/vanja.json`;

const VERIFIED_IBET365_CLUB_SLUGS = new Set([
  'acviseu', 'ajax', 'alaves', 'altach', 'alustenau', 'alverca', 'anderlecht', 'antwerp', 'arouca',
  'arsenal', 'astonvilla', 'atlmadrid', 'auda', 'austriaw', 'azalkmaar', 'beitar', 'benfica',
  'beveren', 'botafogorj', 'bournemouth', 'braga', 'brentford', 'brighton', 'cagliari', 'catanzaro',
  'celta', 'cerclebrugge', 'charleroi', 'chiwhitesox', 'cienciano', 'cinreds', 'cleguardians',
  'clubbrugge', 'cluj', 'corinthians', 'coventry', 'crystalpalace', 'cskasofia', 'dettigers',
  'dinminsk', 'dunajskastreda', 'dynamokiev', 'elche', 'espanyol', 'estrela', 'everton',
  'excelsior', 'ferencvaros', 'feyenoord', 'fiorentina', 'frechm', 'gaeagles', 'genk', 'gent',
  'getafe', 'gilvicente', 'gornikzab', 'guimaraes', 'gyor', 'hajduk', 'hammarby', 'hearts',
  'heerenveen', 'helsinki', 'hibernian', 'hradec', 'hull', 'interturku', 'ipswich', 'jablonec',
  'jagiellonia', 'kortrijk', 'kups', 'lask', 'lechpoznan', 'leeds', 'leuven', 'levante',
  'linettem', 'liverpool', 'lommel', 'lugano', 'macara', 'maccabita', 'mancity', 'manutd',
  'mechelen', 'miamarlins', 'midtjylland', 'mirassol', 'modena', 'monza', 'moreirense',
  'motherwell', 'nec', 'newcastle', 'nordsjaelland', 'norriec', 'nottmforest', 'nyyankees',
  'olimpia', 'omonia', 'osasuna', 'pafos', 'paok', 'parma', 'pitpirates', 'porto', 'prizmicd',
  'psv', 'qarabag', 'quitoldu', 'rakow', 'rangers', 'rfs', 'ried', 'riga', 'rioave', 'salzburg',
  'santaclara', 'santander', 'santos', 'seamariners', 'sevilla', 'shamrock', 'shelbourne', 'sion',
  'sparta', 'stgallen', 'stgilloise', 'sttruiden', 'sturm', 'sudtirol', 'sunderland', 'telstar',
  'thun', 'torino', 'tottenham', 'tromso', 'twente', 'udinese', 'universitatea', 'utrecht',
  'vaduz', 'vallecano', 'valur', 'vanja', 'vasco', 'venezia', 'villarreal', 'vukica', 'waregem',
  'westerlo', 'wolfsberger', 'zalgiris', 'zwolle',
  'alloa', 'flekkeroy', 'jaro', 'mansfield', 'peterborough',
]);

const CLUB_SLUG_ALIASES: Record<string, string> = {
  atleticomadrid: 'atlmadrid',
  athleticomadrid: 'atlmadrid',
  austriawien: 'austriaw',
  botafogo: 'botafogorj',
  celtavigo: 'celta',
  clubbruggekv: 'clubbrugge',
  dynamokyiv: 'dynamokiev',
  manchestercity: 'mancity',
  manchesterunited: 'manutd',
  maccabitelaviv: 'maccabita',
  nottinghamforest: 'nottmforest',
  redbullsalzburg: 'salzburg',
  rbsalzburg: 'salzburg',
  unionstgilloise: 'stgilloise',
  villarrealcf: 'villarreal',
};

function compactTeam(team: string, stripClubPrefix: boolean): string {
  let normalized = team
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
  if (stripClubPrefix) normalized = normalized.replace(/\b(?:afc|fc|fk|cf|sc|ac|nk|sk)\b/g, '');
  return normalized.replace(/[^a-z0-9]/g, '');
}

function teamSlugCandidates(team: string): string[] {
  const full = compactTeam(team, false);
  const stripped = compactTeam(team, true);
  return [...new Set([
    CLUB_SLUG_ALIASES[full] ?? full,
    CLUB_SLUG_ALIASES[stripped] ?? stripped,
  ].filter(Boolean))];
}

function iconUrl(slug: string): string {
  return `${IBET365_ICON_ROOT}/${slug}.webp`;
}

function verifiedIconUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ''));
    if (url.protocol !== 'https:' || url.hostname !== 'ibet-365.com') return null;
    if (!url.pathname.startsWith('/content/club-icons/')) return null;
    return /\.(?:webp|png|jpe?g)$/i.test(url.pathname) ? url.href : null;
  } catch {
    return null;
  }
}

function logoKey(value: unknown): string {
  return compactTeam(String(value ?? '').replace(/\.(?:webp|png|jpe?g)$/i, ''), false);
}

export function capturedTeamLogoMap(payload: unknown): Map<string, string> {
  const logos = new Map<string, string>();
  const add = (rawKey: unknown, rawUrl: unknown): void => {
    const url = verifiedIconUrl(rawUrl);
    if (!url) return;
    const filename = new URL(url).pathname.split('/').at(-1);
    for (const key of [logoKey(rawKey), logoKey(filename)]) {
      if (key && !logos.has(key)) logos.set(key, url);
    }
  };

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (entry && typeof entry === 'object') {
        const item = entry as { name?: unknown; url?: unknown };
        add(item.name, item.url);
      }
    }
    return logos;
  }

  if (!payload || typeof payload !== 'object') return logos;
  const entries = (payload as { logos?: unknown }).logos;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return logos;
  for (const [key, url] of Object.entries(entries)) add(key, url);
  return logos;
}

const IMMEDIATE_TEAM_LOGOS = new Map(
  [...VERIFIED_IBET365_CLUB_SLUGS].map((slug) => [slug, iconUrl(slug)]),
);

export function verifiedTeamLogoUrl(team: string): string | null {
  const key = teamSlugCandidates(team).find((candidate) => IMMEDIATE_TEAM_LOGOS.has(candidate));
  return key ? IMMEDIATE_TEAM_LOGOS.get(key) ?? null : null;
}

@Injectable({ providedIn: 'root' })
export class TeamLogos {
  private readonly logos = new Map(IMMEDIATE_TEAM_LOGOS);
  private readonly revision = signal(0);
  private indexRequested = false;

  url(team: string): string | null {
    this.revision();
    const key = teamSlugCandidates(team).find((candidate) => this.logos.has(candidate));
    if (!this.indexRequested) this.loadCapturedIndex();
    return key ? this.logos.get(key) ?? null : null;
  }

  private loadCapturedIndex(): void {
    if (this.indexRequested) return;
    this.indexRequested = true;
    window.setTimeout(() => {
      void this.fetchIndex(CAPTURED_ICON_INDEX)
        .catch(() => this.fetchIndex(LIVE_ICON_INDEX, 'cors'))
        .catch(() => undefined);
    }, 0);
  }

  private async fetchIndex(url: string, mode: RequestMode = 'same-origin'): Promise<void> {
    const response = await fetch(url, { cache: 'force-cache', mode });
    if (!response.ok) throw new Error(`Team logo index returned ${response.status}`);
    const captured = capturedTeamLogoMap(await response.json());
    let added = 0;
    for (const [key, imageUrl] of captured) {
      if (this.logos.has(key)) continue;
      this.logos.set(key, imageUrl);
      added += 1;
    }
    if (added) this.revision.update((value) => value + 1);
  }
}
