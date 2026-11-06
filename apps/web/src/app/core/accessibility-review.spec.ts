import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AccessibilityReview } from './accessibility-review';
import type { AccessibilityCoverage } from './api';

describe('Accessibility coverage review', () => {
  it('distinguishes missing evidence, incomplete review and recorded violations without a pass claim', async () => {
    await TestBed.configureTestingModule({
      imports: [AccessibilityReview],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(AccessibilityReview);
    fixture.componentRef.setInput('runId', 'owned-run');
    fixture.componentRef.setInput('expected', 3);
    fixture.componentRef.setInput('terminal', true);
    const checked = {
      status: 'checked' as const,
      engine: '4.14',
      viewport: null,
      violations: [],
      incomplete: 1,
      truncated: false,
    };
    const rows: AccessibilityCoverage[] = [
      { resultId: 'UI-001:chromium', attempt: 2, checkpoint: null },
      { resultId: 'UI-002:chromium', attempt: 1, checkpoint: checked },
      {
        resultId: 'UI-003:chromium',
        attempt: 1,
        checkpoint: {
          ...checked,
          violations: [
            {
              id: 'label',
              impact: 'critical',
              description: 'Label required',
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/label',
              nodes: 1,
            },
          ],
        },
      },
    ];
    fixture.componentRef.setInput('coverage', rows);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('2 / 3');
    expect(element.textContent).toContain('Coverage is incomplete');
    expect(element.textContent).toContain('Not checked');
    expect(element.textContent).toContain('Needs manual review');
    expect(element.textContent).toContain('1 finding');
    expect(
      [...element.querySelectorAll('summary')].map((item) => item.textContent).join(' '),
    ).not.toContain('No automated violations');
  });
});
