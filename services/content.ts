// A client's content calendar (plan/3-projects-module.md, "Content calendar per client"; Stage 7.3, D81).
// Who: anyone who sees the client's creatives sees its calendar; assets.write plans and edits it. An item can be
// scheduled or published only once its creative is approved (the approved version is the only one to publish), and
// approving a creative moves its items that are ideas or in production to ready (readyOnApproval).

import { addDays, endOfMonth } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { ContentStatus } from "@/lib/types";
import { contentItemSchema, createContentSchema, updateContentSchema } from "@/lib/validation/content";
import { parse } from "@/lib/validation/common";
import type { AssetSummary, ContentItemRecord, DataStore, NewEvent, Repositories } from "@/repositories";
import { assetScope } from "./assets";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { levelBlocks } from "./spaces";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const NEEDS_APPROVED: ContentStatus[] = ["scheduled", "published"];

export type CalendarMonth = {
  client: { id: string; name: string };
  month: string;
  items: ContentItemRecord[];
  canEdit: boolean;
  /** Creatives to attach, and people to own items (editors only). */
  assets: Array<Pick<AssetSummary, "id" | "title" | "approvalState">>;
  people: Array<{ id: string; name: string }>;
};

/** Inside the creative's review transaction: its items that were ideas or in production become ready to publish. */
export async function readyOnApproval(repos: Repositories, input: { assetId: string; clientId: string; actorId: string | null }): Promise<NewEvent[]> {
  const events: NewEvent[] = [];
  for (const item of await repos.content.listByAsset(input.assetId)) {
    if (item.status !== "idea" && item.status !== "in_production") continue;
    await repos.content.update(item.id, { status: "ready" });
    events.push({ actorId: input.actorId, action: "content.ready", entityType: "content_item", entityId: item.id, clientId: input.clientId, data: { from: item.status, because: "creative approved" } });
  }
  return events;
}

export function createContentService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const canSee = (actor: Actor) => can(actor, "assets.read");
  const canEdit = (actor: Actor) => can(actor, "assets.write");

  async function visibleClient(actor: Actor, clientId: string) {
    if (!isId(clientId)) return null;
    return store.clients.findById(clientId, clientScope(actor));
  }

  /** The creative must be this client's and visible; scheduling or publishing needs it approved. */
  async function checkAsset(actor: Actor, clientId: string, assetId: string | null, status: ContentStatus): Promise<Result<null>> {
    if (!assetId) {
      // Nothing goes out without approved work (test report M8).
      return NEEDS_APPROVED.includes(status) ? invalid("Link an approved creative before marking it scheduled or published.", { assetId: ["Pick the approved creative that goes out."] }) : ok(null);
    }
    const asset = await store.assets.findById(assetId, assetScope(actor));
    if (!asset || asset.clientId !== clientId) return invalid("Pick one of this client's creatives.", { assetId: ["Pick one of this client's creatives."] });
    if (NEEDS_APPROVED.includes(status) && !asset.approvedVersionId) return invalid("Its creative isn't approved yet.", { status: ["Approve the creative first: only approved work goes out."] });
    return ok(null);
  }

  const event = (actor: Actor, item: { id: string; clientId: string }, action: string, data: Record<string, unknown>): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "content_item",
    entityId: item.id,
    clientId: item.clientId,
    data,
  });

  return {
    async month(actor: Actor, clientId: string, month?: string): Promise<Result<CalendarMonth>> {
      if (!canSee(actor)) return forbidden("The content calendar is for the people who make and review creatives.");
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      const m = month ?? clock.today().slice(0, 7);
      if (!MONTH.test(m)) return invalid("Pick a month.");
      const from = `${m}-01`;
      const edit = canEdit(actor);
      const [items, assets, people] = await Promise.all([
        store.content.list({ clientId: client.id, from, to: endOfMonth(from) }),
        edit ? store.assets.list({ scope: assetScope(actor), clientId: client.id, limit: 100 }) : Promise.resolve([]),
        edit ? store.people.listActive() : Promise.resolve([]),
      ]);
      return ok({
        client: { id: client.id, name: client.name },
        month: m,
        items,
        canEdit: edit,
        assets: assets.map((a) => ({ id: a.id, title: a.title, approvalState: a.approvalState })),
        people: people.map((p) => ({ id: p.id, name: p.fullName })),
      });
    },

    /** What goes out next for a client (the client page). */
    async upcoming(actor: Actor, clientId: string): Promise<Result<ContentItemRecord[]>> {
      if (!canSee(actor)) return ok([]);
      const client = await visibleClient(actor, clientId);
      if (!client) return ok([]);
      return ok(await store.content.upcoming(client.id, addDays(clock.today(), -1), 5));
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!canEdit(actor)) return forbidden("Ask the social media lead or a strategist to plan content.");
      const parsed = parse(createContentSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      const client = await visibleClient(actor, input.clientId);
      if (!client) return notFound("That client");
      { const blocked = await levelBlocks(store, actor, client.id, "edit"); if (blocked) return blocked; }
      const asset = await checkAsset(actor, client.id, input.assetId, input.status);
      if (!asset.ok) return asset;
      return commit(store, async (repos) => {
        const id = newId();
        await repos.content.create(id, { ...input, clientId: client.id, createdById: actor.personId });
        return change({ id }, event(actor, { id, clientId: client.id }, "content.created", { title: input.title, channel: input.channel, publishOn: input.publishOn }));
      });
    },

    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!canEdit(actor)) return forbidden("Ask the social media lead or a strategist to change the calendar.");
      const parsed = parse(updateContentSchema, raw);
      if (!parsed.ok) return parsed;
      const { itemId, ...input } = parsed.value;
      const before = await store.content.findById(itemId);
      if (!before || !(await visibleClient(actor, before.clientId))) return notFound("That item");
      { const blocked = await levelBlocks(store, actor, before.clientId, "edit"); if (blocked) return blocked; }
      const asset = await checkAsset(actor, before.clientId, input.assetId, input.status);
      if (!asset.ok) return asset;
      return commit(store, async (repos) => {
        await repos.content.lockForUpdate(itemId);
        const item = await repos.content.findById(itemId);
        if (!item) return notFound("That item");
        const changes: Record<string, [unknown, unknown]> = {};
        for (const k of Object.keys(input) as Array<keyof typeof input>) if (item[k] !== input[k]) changes[k] = [item[k], input[k]];
        if (Object.keys(changes).length === 0) return noChange({ id: itemId });
        await repos.content.update(itemId, input);
        return change({ id: itemId }, event(actor, item, changes.status ? "content.status_changed" : "content.updated", { changes }));
      });
    },

    /** Takes an item off the calendar (soft). */
    async remove(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!canEdit(actor)) return forbidden("Ask the social media lead or a strategist to change the calendar.");
      const parsed = parse(contentItemSchema, raw);
      if (!parsed.ok) return notFound("That item");
      const item = await store.content.findById(parsed.value.itemId);
      if (!item || !(await visibleClient(actor, item.clientId))) return notFound("That item");
      { const blocked = await levelBlocks(store, actor, item.clientId, "edit"); if (blocked) return blocked; }
      return commit(store, async (repos) => {
        await repos.content.update(item.id, { deletedAt: clock.now() });
        return change({ id: item.id }, event(actor, item, "content.removed", { title: item.title }));
      });
    },
  };
}
