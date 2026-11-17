/** Write-only per-project bearer operations for catalog remotes. */
import {
  isN8nProjectKey, normalizeRemoteUrl, remoteAgentSecretRef, remoteSecretRef, type N8nTokenCheck
} from '../shared/mcpCatalog';

export interface RemoteTokenDeps {
  setSecret: (ref: string, token: string) => { ok: boolean };
  deleteSecret: (ref: string) => boolean;
  hasSecret: (ref: string) => boolean;
  getSecret: (ref: string) => string | undefined;
  urlFor: (id: string, project: string) => string | undefined;
  checkToken: (url: string, token: string) => Promise<N8nTokenCheck>;
  /** The stored secret references (names, never values). Without them the
   *  orphans cannot be found: `pruneOrphans` then returns an empty list and
   *  invents nothing. */
  listRefs?: () => string[];
}

export function createRemoteTokenOps(deps: RemoteTokenDeps) {
  const ref = (id: string, project: string): string | undefined =>
    isN8nProjectKey(project) ? remoteSecretRef(id, project) : undefined;
  const agentRef = (id: string, project: string, agentId: unknown): string | undefined =>
    isN8nProjectKey(project) ? remoteAgentSecretRef(id, project, agentId) : undefined;
  return {
    set(id: string, project: string, rawToken: string): { ok: boolean; error?: string } {
      const secretRef = ref(id, project);
      if (!secretRef) return { ok: false, error: 'invalid remote or project' };
      const token = String(rawToken ?? '').trim();
      if (!token) return { ok: true };
      try { return { ok: deps.setSecret(secretRef, token).ok }; }
      catch { return { ok: false }; }
    },
    clear(id: string, project: string): { ok: boolean } {
      const secretRef = ref(id, project);
      if (!secretRef) return { ok: false };
      try { return { ok: deps.deleteSecret(secretRef) }; }
      catch { return { ok: false }; }
    },
    has(id: string, project: string): boolean {
      const secretRef = ref(id, project);
      if (!secretRef) return false;
      try { return deps.hasSecret(secretRef); }
      catch { return false; }
    },
    async test(id: string, project: string): Promise<'missing' | N8nTokenCheck> {
      const secretRef = ref(id, project);
      if (!secretRef) return 'missing';
      try {
        const token = deps.getSecret(secretRef);
        if (!token) return 'missing';
        const url = normalizeRemoteUrl(id, deps.urlFor(id, project));
        if (!url) return 'unreachable';
        return await deps.checkToken(url, token);
      } catch { return 'unreachable'; }
    },

    // ─── The same, for one agent's own token ───────────────────────────────
    setFor(id: string, project: string, agentId: unknown, rawToken: string): { ok: boolean; error?: string } {
      const secretRef = agentRef(id, project, agentId);
      if (!secretRef) return { ok: false, error: 'invalid remote, project or agent' };
      const token = String(rawToken ?? '').trim();
      if (!token) return { ok: true };
      try { return { ok: deps.setSecret(secretRef, token).ok }; }
      catch { return { ok: false }; }
    },
    clearFor(id: string, project: string, agentId: unknown): { ok: boolean } {
      const secretRef = agentRef(id, project, agentId);
      if (!secretRef) return { ok: false };
      try { return { ok: deps.deleteSecret(secretRef) }; }
      catch { return { ok: false }; }
    },
    hasFor(id: string, project: string, agentId: unknown): boolean {
      const secretRef = agentRef(id, project, agentId);
      if (!secretRef) return false;
      try { return deps.hasSecret(secretRef); }
      catch { return false; }
    },
    async testFor(id: string, project: string, agentId: unknown): Promise<'missing' | N8nTokenCheck> {
      const secretRef = agentRef(id, project, agentId);
      if (!secretRef) return 'missing';
      try {
        const token = deps.getSecret(secretRef);
        if (!token) return 'missing';
        const url = normalizeRemoteUrl(id, deps.urlFor(id, project));
        if (!url) return 'unreachable';
        return await deps.checkToken(url, token);
      } catch { return 'unreachable'; }
    },
    /** Deletes the per-agent secrets of agents no longer listed (or of all of
     *  them, with an empty `next`, when the project connector is removed). The
     *  project token is never touched. */
    pruneAgents(id: string, project: string, previous: readonly string[], next: readonly string[]): string[] {
      const keep = new Set(next);
      const removed: string[] = [];
      for (const agentId of previous) {
        if (keep.has(agentId)) continue;
        const secretRef = agentRef(id, project, agentId);
        if (!secretRef) continue;
        try { if (deps.deleteSecret(secretRef)) removed.push(agentId); }
        catch { /* a secret that will not delete is retried at the next change */ }
      }
      return removed;
    },
    /** Deletes the per-agent secrets whose `agentId` is not in the current list:
     *  the orphans, left behind by a failed deletion or by a config written
     *  without passing through here. The project token (two segments) and the
     *  other projects are never touched. */
    pruneOrphans(id: string, project: string, keep: readonly string[]): string[] {
      // Same guard as `remoteSecretRef(id, project)`: an invalid connector or
      // project has no reference at all, and nothing is deleted.
      if (!deps.listRefs || !ref(id, project)) return [];
      const prefix = `mcp:${id}:${project}:`;
      const kept = new Set(keep);
      const removed: string[] = [];
      let refs: string[];
      try { refs = deps.listRefs(); } catch { return []; }
      for (const secretRef of refs) {
        if (!secretRef.startsWith(prefix)) continue;
        const agentId = secretRef.slice(prefix.length);
        if (kept.has(agentId) || !isN8nProjectKey(agentId)) continue;
        try { if (deps.deleteSecret(secretRef)) removed.push(agentId); }
        catch { /* stays an orphan: retried at the next save */ }
      }
      return removed;
    }
  };
}

/** The token an agent uses towards the upstream: its own first, the project's
 *  otherwise. Returns nothing when neither exists (fail closed). The AGENT must
 *  already be enabled by `resolveRemoteProject`: here we only choose WHICH token
 *  to use, never WHETHER to use one. */
export function createAgentTokenResolver(deps: { getSecret: (ref: string) => string | undefined }) {
  return (id: string, project: string, agentId: string): string | undefined => {
    const own = remoteAgentSecretRef(id, project, agentId);
    if (own) {
      const token = deps.getSecret(own);
      if (token) return token;
    }
    const shared = remoteSecretRef(id, project);
    return shared ? deps.getSecret(shared) : undefined;
  };
}
