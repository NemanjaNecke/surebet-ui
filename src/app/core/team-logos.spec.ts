import { describe, expect, it } from 'vitest';

import { capturedTeamLogoMap, verifiedTeamLogoUrl } from './team-logos';

describe('verifiedTeamLogoUrl', () => {
  it('maps only club icons observed in the captured bookmaker traffic', () => {
    expect(verifiedTeamLogoUrl('Arsenal FC')).toBe(
      'https://ibet-365.com/content/club-icons/arsenal.webp',
    );
    expect(verifiedTeamLogoUrl('Manchester City')).toBe(
      'https://ibet-365.com/content/club-icons/mancity.webp',
    );
    expect(verifiedTeamLogoUrl('Peterborough')).toBe(
      'https://ibet-365.com/content/club-icons/peterborough.webp',
    );
  });

  it('does not manufacture a URL for an unknown team', () => {
    expect(verifiedTeamLogoUrl('Nepostojeći klub')).toBeNull();
  });

  it('accepts every captured image format and normalizes dotted names', () => {
    const logos = capturedTeamLogoMap({
      logos: {
        'ac.viseu': 'https://ibet-365.com/content/club-icons/ac.viseu.webp',
        bohemians: 'https://ibet-365.com/content/club-icons/bohemians.png',
        example: 'https://ibet-365.com/content/club-icons/example.jpg',
      },
    });

    expect(logos.get('acviseu')).toContain('ac.viseu.webp');
    expect(logos.get('bohemians')).toContain('bohemians.png');
    expect(logos.get('example')).toContain('example.jpg');
  });

  it('rejects image URLs outside the verified bookmaker path', () => {
    const logos = capturedTeamLogoMap([
      { name: 'arsenal', url: 'https://example.com/arsenal.webp' },
      { name: 'ajax', url: 'http://ibet-365.com/content/club-icons/ajax.webp' },
    ]);

    expect(logos.size).toBe(0);
  });
});
