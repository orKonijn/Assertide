import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Api } from '../core/api';
import { Settings } from './settings';

describe('Settings section shortcuts', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });
  it('focuses and scrolls to each section without navigating away', () => {
    const host = document.createElement('div');
    const ids = [
      'settings-health',
      'settings-members',
      'settings-environments',
      'settings-accounts',
      'settings-audit',
    ];
    host.innerHTML = ids.map((id) => `<section id="${id}"></section>`).join('');
    document.body.append(host);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { identity: signal({ role: 'viewer' }) } },
        { provide: ElementRef, useValue: new ElementRef(host) },
      ],
    });
    const settings = TestBed.runInInjectionContext(() => new Settings());
    const original = location.href;
    for (const id of ids) {
      const section = host.querySelector<HTMLElement>('#' + id)!;
      const scroll = vi.fn();
      section.scrollIntoView = scroll;
      settings.openSection(id);
      expect(document.activeElement).toBe(section);
      expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
      expect(location.href).toBe(original);
    }
    expect(() => settings.openSection('missing')).not.toThrow();
  });
});
