import { Injectable, signal } from '@angular/core';

const IBET365_ICON_ROOT = 'https://ibet-365.com/content/club-icons';
const IBET365_ICON_INDEX = `${IBET365_ICON_ROOT}/vanja.json`;

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

export function verifiedTeamLogoUrl(team: string): string | null {
  const slug = teamSlugCandidates(team).find((candidate) => VERIFIED_IBET365_CLUB_SLUGS.has(candidate));
  return slug ? iconUrl(slug) : null;
}

@Injectable({ providedIn: 'root' })
export class TeamLogos {
  private readonly knownSlugs = new Set(VERIFIED_IBET365_CLUB_SLUGS);
  private readonly revision = signal(0);
  private indexRequested = false;

  url(team: string): string | null {
    this.revision();
    const slug = teamSlugCandidates(team).find((candidate) => this.knownSlugs.has(candidate));
    if (!slug) this.loadCapturedIndex();
    return slug ? iconUrl(slug) : null;
  }

  private loadCapturedIndex(): void {
    if (this.indexRequested) return;
    this.indexRequested = true;
    window.setTimeout(() => {
      void fetch(IBET365_ICON_INDEX, { cache: 'force-cache', mode: 'cors' })
        .then((response) => response.ok ? response.json() : [])
        .then((payload: unknown) => {
          if (!Array.isArray(payload)) return;
          let added = 0;
          for (const entry of payload) {
            if (!entry || typeof entry !== 'object') continue;
            const slug = String((entry as { name?: unknown }).name ?? '').toLocaleLowerCase();
            if (!/^[a-z0-9.-]{1,80}$/.test(slug) || slug.includes('.')) continue;
            const sizeBefore = this.knownSlugs.size;
            this.knownSlugs.add(slug);
            if (this.knownSlugs.size !== sizeBefore) added += 1;
          }
          if (added) this.revision.update((value) => value + 1);
        })
        .catch(() => undefined);
    }, 0);
  }
}
