/** Clients from the projects (including Oppllo's own work) plus every live client without one yet, by name (test report L13). */
export const mergeClients = (fromProjects: ReadonlyArray<{ clientId: string; clientName: string }>, more: ReadonlyArray<{ id: string; name: string }>) =>
  [...new Map([...fromProjects.map((p) => [p.clientId, { id: p.clientId, name: p.clientName }] as const), ...more.map((c) => [c.id, c] as const)]).values()].sort((a, b) => a.name.localeCompare(b.name));
