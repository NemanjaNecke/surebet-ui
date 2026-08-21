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

export function verifiedTeamLogoUrl(team: string): string | null {
  const compact = team
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\b(?:afc|fc|fk|cf|sc|ac|nk|sk)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  const slug = CLUB_SLUG_ALIASES[compact] ?? compact;
  return VERIFIED_IBET365_CLUB_SLUGS.has(slug)
    ? `https://ibet-365.com/content/club-icons/${slug}.webp`
    : null;
}
