import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Notifications } from './notifications';
describe('session notifications', () => {
  it('expires the live announcement after five seconds while retaining the bounded log, then clears on logout', () => {
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
  it('clears unread when opened, retains history, and counts later arrivals', () => {
    const notices = TestBed.inject(Notifications);
    notices.success('Saved.');
    notices.success('Updated.');
    expect(notices.unread()).toBe(2);
    notices.setHistoryOpen(true);
    expect(notices.unread()).toBe(0);
    notices.success('Visible while open.');
    expect(notices.unread()).toBe(0);
    notices.setHistoryOpen(false);
    expect(notices.unread()).toBe(0);
    expect(notices.history()).toHaveLength(3);
    notices.success('New action.');
    expect(notices.unread()).toBe(1);
    notices.clear();
    expect(notices.unread()).toBe(0);
    TestBed.resetTestingModule();
  });
});
