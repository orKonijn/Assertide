import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Notifications } from './notifications';
describe('session notifications', () => {
  it('expires the toast after five seconds while retaining the bounded log, then clears on logout', () => {
    vi.useFakeTimers();
    try {
      const notices = TestBed.inject(Notifications);
      notices.success('Suite saved.');
      vi.advanceTimersByTime(4999);
      expect(notices.active().length).toBe(1);
      vi.advanceTimersByTime(1);
      expect(notices.active().length).toBe(0);
      expect(notices.history()[0]?.message).toBe('Suite saved.');
      for (let index = 0; index < 60; index++) notices.success('Execution requested.');
      expect(notices.history().length).toBe(50);
      notices.clear();
      expect(notices.history().length).toBe(0);
    } finally {
      TestBed.resetTestingModule();
      vi.useRealTimers();
    }
  });
});
