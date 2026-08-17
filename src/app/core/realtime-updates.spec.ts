import { shouldRefreshFromRealtimeMessage } from './realtime-updates';

describe('shouldRefreshFromRealtimeMessage', () => {
  it('ignores connection and heartbeat messages', () => {
    expect(shouldRefreshFromRealtimeMessage('{"type":"connected"}')).toBe(false);
    expect(shouldRefreshFromRealtimeMessage('{"type":"heartbeat"}')).toBe(false);
  });

  it('refreshes only for supported live data changes', () => {
    expect(shouldRefreshFromRealtimeMessage('{"type":"odds.snapshot"}')).toBe(true);
    expect(shouldRefreshFromRealtimeMessage('{"type":"odds.update"}')).toBe(true);
    expect(shouldRefreshFromRealtimeMessage('{"type":"match.removed"}')).toBe(true);
    expect(shouldRefreshFromRealtimeMessage('{"type":"unknown"}')).toBe(false);
    expect(shouldRefreshFromRealtimeMessage('not-json')).toBe(false);
  });
});
