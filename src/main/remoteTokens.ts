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

    // ─── T100: lo stesso, ma per il token personale di un agente ────────────
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
    /** Cancella i segreti per agente di chi non e' piu' nella lista (o di tutti,
     *  con `next` vuoto, quando il connettore del progetto viene tolto). Il token
     *  del progetto non si tocca. */
    pruneAgents(id: string, project: string, previous: readonly string[], next: readonly string[]): string[] {
      const keep = new Set(next);
      const removed: string[] = [];
      for (const agentId of previous) {
        if (keep.has(agentId)) continue;
        const secretRef = agentRef(id, project, agentId);
        if (!secretRef) continue;
        try { if (deps.deleteSecret(secretRef)) removed.push(agentId); }
        catch { /* un segreto che non si cancella si ritenta al prossimo cambio */ }
      }
      return removed;
    }
  };
}

/** Il token con cui un agente parla con l'upstream: prima il suo, poi quello del
 *  progetto. Non restituisce nulla se none dei due c'e' (fail closed). L'AGENTE
 *  deve essere gia' stato abilitato da `resolveRemoteProject`: qui si sceglie
 *  solo QUALE token usare, mai SE usarlo. */
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
