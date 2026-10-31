const prefix = 'assertide-selection:';
export interface SelectionDraft {
  scope: string;
  revision: string;
  ids: string[];
}

export function readSelectionDraft(project: string, scope: string): SelectionDraft | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(prefix + project) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'scope' in value &&
      value.scope === scope &&
      'revision' in value &&
      typeof value.revision === 'string' &&
      'ids' in value &&
      Array.isArray(value.ids) &&
      value.ids.length <= 10000 &&
      value.ids.every((id: unknown) => typeof id === 'string' && id.length <= 200)
    ) {
      return { scope: value.scope, revision: value.revision, ids: [...new Set<string>(value.ids)] };
    }
  } catch {
    // Storage may be disabled or contain an obsolete draft; selection still works in memory.
  }
  return null;
}

export function writeSelectionDraft(project: string, draft: SelectionDraft): boolean {
  try {
    if (!draft.ids.length) {
      sessionStorage.removeItem(prefix + project);
    } else {
      const keys = Object.keys(sessionStorage).filter((key) => key.startsWith(prefix));
      if (keys.length >= 20 && !keys.includes(prefix + project)) {
        sessionStorage.removeItem(keys[0]);
      }
      sessionStorage.setItem(prefix + project, JSON.stringify(draft));
    }
    return true;
  } catch {
    return false;
  }
}

export function clearSelectionDrafts(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // No persistent draft is available when storage is disabled.
  }
}
