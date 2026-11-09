import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Api } from './api';
describe('Complete suite lists', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });
  it('follows every page and deduplicates suites', async () => {
    const api = TestBed.inject(Api);
    const http = TestBed.inject(HttpTestingController);
    const result = api.get<{ items: { id: string }[] }>('/projects/project/suites');
    http
      .expectOne('/v1/projects/project/suites?limit=200')
      .flush({ items: [{ id: 'a' }], nextCursor: 'cursor' });
    await Promise.resolve();
    http
      .expectOne('/v1/projects/project/suites?limit=200&cursor=cursor')
      .flush({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: null });
    expect((await result).items.map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('rejects a repeated cursor instead of returning a silently incomplete list', async () => {
    const api = TestBed.inject(Api);
    const http = TestBed.inject(HttpTestingController);
    const result = api.get('/projects/project/suites');
    const rejection = expect(result).rejects.toThrow('Suite pagination did not advance');
    http
      .expectOne('/v1/projects/project/suites?limit=200')
      .flush({ items: [], nextCursor: 'cursor' });
    await Promise.resolve();
    http
      .expectOne('/v1/projects/project/suites?limit=200&cursor=cursor')
      .flush({ items: [], nextCursor: 'cursor' });
    await rejection;
  });
});
