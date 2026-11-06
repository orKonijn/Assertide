import { TestBed } from '@angular/core/testing';

import type { PerformanceCoverage } from './api';
import { PerformanceReview } from './performance-review';

describe('Performance measurement review', () => {
  it('keeps missing and failed collection separate from a measured pass', async () => {
    await TestBed.configureTestingModule({ imports: [PerformanceReview] }).compileComponents();
    const fixture = TestBed.createComponent(PerformanceReview);
    const rows: PerformanceCoverage[] = [
      { resultId: 'missing:chromium', checkpoint: null, decisions: [] },
      {
        resultId: 'failed:chromium',
        checkpoint: { status: 'unavailable', reason: 'measurement-failed' },
        decisions: [],
      },
      {
        resultId: 'measured:chromium',
        checkpoint: { status: 'measured', samples: [] },
        decisions: [
          {
            metric: 'lcpMs',
            status: 'inconclusive',
            samples: 3,
            median: 1500,
            minimum: 1200,
            maximum: 2100,
            limit: 2500,
            reason: 'high-variability',
          },
        ],
      },
    ];
    fixture.componentRef.setInput('coverage', rows);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Not measured');
    expect(element.textContent).toContain('measurement failed');
    expect(element.textContent).toContain('high variability');
    expect(element.querySelector('[data-status="pass"]')).toBeNull();
    expect(element.querySelector('[data-status="inconclusive"]')).not.toBeNull();
  });
});
