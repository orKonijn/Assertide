import { guestDurationMs, validGuestExpiry } from './guest-session';

describe('guest session lifetime', () => {
  it('restores only a bounded future expiry without extending it', () => {
    const now = 100000;
    expect(validGuestExpiry(String(now + guestDurationMs), now)).toBe(now + guestDurationMs);
    expect(validGuestExpiry(String(now + guestDurationMs), now + 100)).toBe(now + guestDurationMs);
    for (const value of [
      null,
      'garbage',
      'Infinity',
      '-1',
      String(now),
      String(now + guestDurationMs + 1),
    ]) {
      expect(validGuestExpiry(value, now)).toBe(0);
    }
  });
});
