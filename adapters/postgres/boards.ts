import { and, desc, eq, getTableColumns, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { boardComments, boardFiles, boardTaskLinks, boardPeople, boardReactions, boards, boardVersions, boardVotes, clients, people, projects } from "@/db/schema";
import type { BoardRecord, BoardsRepository, BoardSummary } from "@/repositories";
import type { Db } from "./connection";

// Lists never carry the scene (it can be megabytes).
const { scene: _scene, ...boardColumns } = getTableColumns(boards);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function boardsRepository(db: Db): BoardsRepository {
  return {
    async create({ scene, at, ...row }) {
      await db.insert(boards).values({ ...row, scene, createdAt: at, updatedAt: at });
    },
    async find(id) {
      const [r] = await db.select(boardColumns).from(boards).where(eq(boards.id, id));
      return (r as BoardRecord | undefined) ?? null;
    },
    async scene(id) {
      const [r] = await db.select({ scene: boards.scene }).from(boards).where(eq(boards.id, id));
      return r?.scene ?? null;
    },
    async list({ clientIds, projectId, archived = false, q, personId, limit = 200 }) {
      if (!clientIds.length) return [];
      const creator = alias(people, "board_creator");
      const updater = alias(people, "board_updater");
      const text = q?.trim() ? `%${escapeLike(q.trim())}%` : null;
      const rows = await db
        .select({
          ...boardColumns,
          clientName: clients.name,
          projectName: projects.name,
          createdByName: creator.fullName,
          updatedByName: updater.fullName,
          favourite: sql<boolean>`coalesce(${boardPeople.favourite}, false)`,
          viewedAt: boardPeople.viewedAt,
        })
        .from(boards)
        .innerJoin(clients, eq(clients.id, boards.clientId))
        .leftJoin(projects, eq(projects.id, boards.projectId))
        .leftJoin(creator, eq(creator.id, boards.createdById))
        .leftJoin(updater, eq(updater.id, boards.updatedById))
        .leftJoin(boardPeople, and(eq(boardPeople.boardId, boards.id), eq(boardPeople.personId, personId)))
        .where(
          and(
            inArray(boards.clientId, [...clientIds]),
            archived ? isNotNull(boards.archivedAt) : isNull(boards.archivedAt),
            projectId ? eq(boards.projectId, projectId) : undefined,
            text ? or(ilike(boards.title, text), ilike(boards.searchText, text), sql`${text} ilike any(select '%' || t || '%' from unnest(${boards.tags}) t)`) : undefined,
          ),
        )
        .orderBy(desc(boards.updatedAt))
        .limit(limit);
      return rows as BoardSummary[];
    },
    async update(id, { at, ...patch }) {
      await db.update(boards).set({ ...patch, updatedAt: at }).where(eq(boards.id, id));
    },
    async saveScene(id, baseVersion, { at, ...row }) {
      const r = await db
        .update(boards)
        .set({ ...row, version: sql`${boards.version} + 1`, updatedAt: at })
        .where(and(eq(boards.id, id), eq(boards.version, baseVersion)))
        .returning({ version: boards.version });
      return r[0]?.version ?? null;
    },

    async setFavourite(boardId, personId, favourite) {
      await db.insert(boardPeople).values({ boardId, personId, favourite }).onConflictDoUpdate({ target: [boardPeople.boardId, boardPeople.personId], set: { favourite } });
    },
    async markViewed(boardId, personId, at) {
      await db.insert(boardPeople).values({ boardId, personId, viewedAt: at }).onConflictDoUpdate({ target: [boardPeople.boardId, boardPeople.personId], set: { viewedAt: at } });
    },

    async addVersion({ at, ...row }) {
      await db.insert(boardVersions).values({ ...row, createdAt: at });
    },
    async versions(boardId) {
      return db
        .select({ id: boardVersions.id, boardId: boardVersions.boardId, version: boardVersions.version, name: boardVersions.name, objectCount: boardVersions.objectCount, createdById: boardVersions.createdById, createdByName: people.fullName, createdAt: boardVersions.createdAt })
        .from(boardVersions)
        .leftJoin(people, eq(people.id, boardVersions.createdById))
        .where(eq(boardVersions.boardId, boardId))
        .orderBy(desc(boardVersions.createdAt))
        .limit(100);
    },
    async version(id) {
      const [r] = await db
        .select({ id: boardVersions.id, boardId: boardVersions.boardId, version: boardVersions.version, name: boardVersions.name, objectCount: boardVersions.objectCount, createdById: boardVersions.createdById, createdByName: people.fullName, createdAt: boardVersions.createdAt, scene: boardVersions.scene })
        .from(boardVersions)
        .leftJoin(people, eq(people.id, boardVersions.createdById))
        .where(eq(boardVersions.id, id));
      return r ?? null;
    },
    async lastAutoVersionAt(boardId) {
      const [r] = await db.select({ at: sql<Date | null>`max(${boardVersions.createdAt})` }).from(boardVersions).where(and(eq(boardVersions.boardId, boardId), isNull(boardVersions.name)));
      return r?.at ? new Date(r.at) : null;
    },

    votes(boardId, round) {
      return db.select({ elementId: boardVotes.elementId, personId: boardVotes.personId }).from(boardVotes).where(and(eq(boardVotes.boardId, boardId), eq(boardVotes.round, round), isNull(boardVotes.deletedAt)));
    },
    async addVote({ at, ...row }) {
      await db.insert(boardVotes).values({ ...row, createdAt: at });
    },
    async removeVote(boardId, round, elementId, personId, at) {
      const r = await db
        .update(boardVotes)
        .set({ deletedAt: at })
        .where(
          eq(
            boardVotes.id,
            sql`(select id from board_votes where board_id = ${boardId} and round = ${round} and element_id = ${elementId} and person_id = ${personId} and deleted_at is null order by created_at desc limit 1)`,
          ),
        )
        .returning({ id: boardVotes.id });
      return r.length > 0;
    },

    reactions(boardId) {
      return db.select({ elementId: boardReactions.elementId, emoji: boardReactions.emoji, personId: boardReactions.personId }).from(boardReactions).where(and(eq(boardReactions.boardId, boardId), isNull(boardReactions.deletedAt)));
    },
    async toggleReaction({ at, ...row }) {
      const off = await db
        .update(boardReactions)
        .set({ deletedAt: at })
        .where(and(eq(boardReactions.boardId, row.boardId), eq(boardReactions.elementId, row.elementId), eq(boardReactions.personId, row.personId), eq(boardReactions.emoji, row.emoji), isNull(boardReactions.deletedAt)))
        .returning({ id: boardReactions.id });
      if (off.length) return false;
      await db.insert(boardReactions).values({ ...row, createdAt: at });
      return true;
    },

    comments(boardId) {
      return db
        .select({ id: boardComments.id, boardId: boardComments.boardId, elementId: boardComments.elementId, authorId: boardComments.authorId, authorName: people.fullName, body: boardComments.body, createdAt: boardComments.createdAt })
        .from(boardComments)
        .innerJoin(people, eq(people.id, boardComments.authorId))
        .where(and(eq(boardComments.boardId, boardId), isNull(boardComments.deletedAt)))
        .orderBy(boardComments.createdAt);
    },
    async comment(id) {
      const [r] = await db
        .select({ id: boardComments.id, boardId: boardComments.boardId, elementId: boardComments.elementId, authorId: boardComments.authorId, authorName: people.fullName, body: boardComments.body, createdAt: boardComments.createdAt })
        .from(boardComments)
        .innerJoin(people, eq(people.id, boardComments.authorId))
        .where(and(eq(boardComments.id, id), isNull(boardComments.deletedAt)));
      return r ?? null;
    },
    async addComment({ at, ...row }) {
      await db.insert(boardComments).values({ ...row, createdAt: at });
    },
    async removeComment(id, at) {
      await db.update(boardComments).set({ deletedAt: at }).where(eq(boardComments.id, id));
    },

    async addTaskLink({ at, ...row }) {
      const r = await db.insert(boardTaskLinks).values({ ...row, createdAt: at }).onConflictDoNothing().returning({ t: boardTaskLinks.taskId });
      return r.length > 0;
    },
    taskLinks(boardId) {
      return db.select({ elementId: boardTaskLinks.elementId, taskId: boardTaskLinks.taskId }).from(boardTaskLinks).where(eq(boardTaskLinks.boardId, boardId));
    },
    async addFile({ at, ...row }) {
      await db.insert(boardFiles).values({ ...row, createdAt: at }).onConflictDoNothing();
    },
    async file(boardId, fileKey) {
      const [r] = await db
        .select({ boardId: boardFiles.boardId, fileKey: boardFiles.fileKey, contentType: boardFiles.contentType, fileProvider: boardFiles.fileProvider, fileLocation: boardFiles.fileLocation, fileId: boardFiles.fileId, fileSize: boardFiles.fileSize })
        .from(boardFiles)
        .where(and(eq(boardFiles.boardId, boardId), eq(boardFiles.fileKey, fileKey)));
      return r ?? null;
    },
    async fileKeys(boardId) {
      return (await db.select({ k: boardFiles.fileKey }).from(boardFiles).where(eq(boardFiles.boardId, boardId))).map((r) => r.k);
    },
  };
}
