import { clearSelectionDrafts, readSelectionDraft, writeSelectionDraft } from './selection-draft';

describe('tab selection drafts', () => {
  beforeEach(() => sessionStorage.clear());
  it('restores IDs only for the matching project, account and sign-in session', () => {
    writeSelectionDraft('project-a', {
      scope: 'account-a/session-1',
      revision: 'rev1',
      ids: ['LAB-001', 'LAB-001'],
    });
    expect(readSelectionDraft('project-a', 'account-a/session-1')?.ids).toEqual(['LAB-001']);
    expect(readSelectionDraft('project-b', 'account-a/session-1')).toBeNull();
    expect(readSelectionDraft('project-a', 'account-b/session-1')).toBeNull();
    expect(readSelectionDraft('project-a', 'account-a/session-2')).toBeNull();
  });
  it('ignores malformed drafts and clears only selection data', () => {
    sessionStorage.setItem('assertide-selection:bad', '{');
    expect(readSelectionDraft('bad', 'session')).toBeNull();
    sessionStorage.setItem(
      'assertide-selection:invalid',
      JSON.stringify({ scope: 'session', revision: 'rev', ids: [3] }),
    );
    expect(readSelectionDraft('invalid', 'session')).toBeNull();
    sessionStorage.setItem('unrelated', 'keep');
    clearSelectionDrafts();
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
  it('removes empty drafts and bounds the number of saved projects', () => {
    for (let index = 0; index < 21; index++) {
      writeSelectionDraft(String(index), { scope: 'session', revision: 'rev', ids: ['LAB-001'] });
    }
    expect(sessionStorage.length).toBe(20);
    writeSelectionDraft('20', { scope: 'session', revision: 'rev', ids: [] });
    expect(readSelectionDraft('20', 'session')).toBeNull();
  });
});
