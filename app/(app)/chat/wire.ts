// Chat messages as the browser receives them: times as ISO strings, the same from the page, actions and polling.
import type { MessageView } from "@/services/chat";

export type WireMessage = Omit<MessageView, "createdAt" | "updatedAt" | "editedAt" | "deletedAt"> & { createdAt: string; updatedAt: string; editedAt: string | null; deletedAt: string | null };

export const wire = (m: MessageView): WireMessage => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
  editedAt: m.editedAt?.toISOString() ?? null,
  deletedAt: m.deletedAt?.toISOString() ?? null,
});
