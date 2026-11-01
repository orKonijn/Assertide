import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../app.routes';
import { About } from './about';
import { creator } from './about-content';

describe('About Assertide', () => {
  it('renders approved creator content and omits unapproved personal links and imagery', async () => {
    await TestBed.configureTestingModule({
      imports: [About],
      providers: [provideRouter(routes)],
    }).compileComponents();
    const fixture = TestBed.createComponent(About);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Independent freelancer');
    expect(element.textContent).toContain('Or Konijn');
    expect(element.textContent).toContain('July–November 2026');
    expect(element.querySelector('.creator-experience')?.textContent).toContain(
      'Elevation Aquaculture',
    );
    expect(element.querySelector('.creator-experience')?.textContent).toContain(
      'Global Expansion Solutions',
    );
    expect(element.querySelector('.creator-experience')?.textContent).toContain('Merkazim.info');
    expect(element.textContent).toContain('website-testing tools for companies');
    expect(element.querySelector('.creator-photo')).toBeNull();
    expect(creator.links).toEqual([]);
    expect(element.querySelectorAll('.map-node').length).toBe(4);
    expect(element.querySelectorAll('.about-lifecycle li').length).toBe(8);
  });
  it('registers the about route before the fallback', () => {
    expect(routes.findIndex((route) => route.path === 'about')).toBeLessThan(
      routes.findIndex((route) => route.path === '**'),
    );
    expect(routes.find((route) => route.path === 'about')?.loadComponent).toBeDefined();
  });
});
