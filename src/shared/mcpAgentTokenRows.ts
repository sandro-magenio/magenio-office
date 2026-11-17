/** The key the settings panel reloads the "token is set" state on. It must
 *  change when the list of AGENTS changes, not only the projects: when an agent
 *  leaves the list its secret is deleted, and on re-entry the panel would show
 *  "set" for a token that no longer exists. */
export interface AgentRowsSource {
  [id: string]: { projects?: Record<string, { agents?: string[] }> } | undefined;
}

export const agentTokenRows = (defaults: AgentRowsSource | undefined): string[] =>
  Object.entries(defaults ?? {}).flatMap(([id, entry]) =>
    Object.entries(entry?.projects ?? {}).flatMap(([project, pe]) =>
      (pe.agents ?? []).map((agentId) => `${id}:${project}:${agentId}`))).sort();

export const agentTokenRowsKey = (defaults: AgentRowsSource | undefined): string =>
  agentTokenRows(defaults).join('\n');
