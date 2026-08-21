import { describe, expect, it } from 'vitest';

import { verifiedTeamLogoUrl } from './team-logos';

describe('verifiedTeamLogoUrl', () => {
  it('maps only club icons observed in the captured bookmaker traffic', () => {
    expect(verifiedTeamLogoUrl('Arsenal FC')).toBe(
      'https://ibet-365.com/content/club-icons/arsenal.webp',
    );
    expect(verifiedTeamLogoUrl('Manchester City')).toBe(
      'https://ibet-365.com/content/club-icons/mancity.webp',
    );
  });

  it('does not manufacture a URL for an unknown team', () => {
    expect(verifiedTeamLogoUrl('Nepostojeći klub')).toBeNull();
  });
});
