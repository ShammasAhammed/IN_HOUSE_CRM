"use server";

import { refresh } from "next/cache";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function markReadAction(ids: string[] | "all"): Promise<void> {
  const actor = await requireActor();
  await getServices().notifications.markRead(actor, ids);
  refresh();
}
