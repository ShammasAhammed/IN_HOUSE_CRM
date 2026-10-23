// What the form builder needs: the lead's projects and the team.
import { getServices } from "@/lib/server/container";
import type { Actor } from "@/services/permissions";

export async function editorOptions(actor: Actor) {
  const services = getServices();
  const [projects, directory] = await Promise.all([services.projects.list(actor, { statuses: ["active", "planned", "on_hold"] }), services.people.directory(actor)]);
  return {
    projects: projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName })).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name)) : [],
    people: directory.ok ? directory.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName })) : [],
  };
}
