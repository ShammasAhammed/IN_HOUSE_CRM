// Space kits through the Oppllo MCP (Stage 14.4): the owner's (or HR's) Claude can set up spaces. Applying always
// starts with a preview (confirm false); only with confirm true is anything made, with the same checks and events
// as the screen.
import { z } from "zod";
import type { AiTool } from "@/repositories";
import { tool } from "./assistant";
import type { Actor } from "./permissions";
import { describeItem, KIT_KEYS } from "./rules/space-kits";
import type { SpaceKitService } from "./space-kits";
import type { createSpaceService } from "./spaces";

export function kitTools(actor: Actor, d: { spaceKits: SpaceKitService; spaces: Pick<ReturnType<typeof createSpaceService>, "list"> }): AiTool[] {
  async function spaceId(name: string): Promise<{ ok: true; id: string } | { ok: false; text: string }> {
    const r = await d.spaces.list(actor);
    const list = r.ok ? r.value.spaces.filter((s) => !s.archived) : [];
    const q = name.trim().toLowerCase();
    const hits = list.filter((s) => s.name.toLowerCase() === q).length ? list.filter((s) => s.name.toLowerCase() === q) : list.filter((s) => s.name.toLowerCase().includes(q));
    if (hits.length === 1) return { ok: true, id: hits[0]!.id };
    return { ok: false, text: hits.length ? `"${name}" matches ${hits.map((s) => s.name).join(", ")}. Which one?` : `No space called "${name}". Spaces: ${list.map((s) => s.name).join(", ") || "none"}.` };
  }
  return [
    tool({
      name: "list_space_kits",
      description: "Ready-made setups for Oppllo's own team spaces (Finance, HR, Sales, Oppllo Marketing, Founder office, Operations): what each makes (project, recurring tasks, pages, goals, board), whether it makes the space private, and where it's already applied.",
      input: z.strictObject({}),
      run: async () => {
        const kits = await d.spaceKits.list(actor);
        return { ok: true, text: JSON.stringify(kits.map((k) => ({ kit: k.key, name: k.name, description: k.description, private: k.private, makes: k.items.map(describeItem), applied_in: k.appliedTo.map((a) => a.name) }))) };
      },
    }),
    tool({
      name: "apply_space_kit",
      description: "Set up a space with a kit (owner or HR only). Always call first with confirm false to get the preview (what it will make, privacy), show it to the person, and only after they agree call again with confirm true. Applying again adds only what's missing. Give an existing space's name, or new_space_name for a new space (owner only).",
      input: z.strictObject({ kit: z.enum(KIT_KEYS), space: z.string().describe('An existing space\'s name, or "".'), new_space_name: z.string().describe('A new space\'s name, or "".'), confirm: z.boolean().describe("false = preview only; true = make it (after the person agreed).") }),
      run: async ({ kit, space, new_space_name, confirm }) => {
        let target: { kit: string; spaceId?: string; newSpaceName?: string } = { kit };
        if (space.trim()) {
          const s = await spaceId(space);
          if (!s.ok) return s;
          target = { kit, spaceId: s.id };
        } else if (new_space_name.trim()) target = { kit, newSpaceName: new_space_name.trim() };
        else return { ok: false, text: "Give a space's name or a new space name." };
        if (!confirm) {
          const p = await d.spaceKits.preview(actor, target);
          return p.ok ? { ok: true, text: JSON.stringify({ preview: true, will_make: p.value.create, already_there: p.value.existing.length, privacy: p.value.privacy, notes: p.value.notes, next: "Show this to the person; call again with confirm true if they agree." }) } : { ok: false, text: p.error.message };
        }
        const r = await d.spaceKits.apply(actor, target);
        return r.ok ? { ok: true, text: JSON.stringify({ done: true, made: r.value.created, already_there: r.value.existing.length, privacy: r.value.privacy, space_id: r.value.spaceId }) } : { ok: false, text: r.error.message };
      },
    }),
  ];
}
