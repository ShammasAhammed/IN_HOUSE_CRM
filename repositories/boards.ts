// Idea Boards (Stage 13.1): boards, their versions, votes, reactions, comments and images.
import type { BoardScene, BoardTemplate, BoardTimer, BoardVoting, StorageProvider } from "@/lib/types";

export type { BoardScene, BoardTimer, BoardVoting };

export type BoardRecord = {
  id: string;
  clientId: string;
  projectId: string | null;
  title: string;
  section: string | null;
  tags: string[];
  version: number;
  searchText: string;
  objectCount: number;
  sceneBytes: number;
  thumbnail: string | null;
  template: BoardTemplate | null;
  voting: BoardVoting | null;
  timer: BoardTimer | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

/** A board in a list: no scene, with names and the person's own favourite and last visit. */
export type BoardSummary = BoardRecord & { clientName: string; projectName: string | null; createdByName: string | null; updatedByName: string | null; favourite: boolean; viewedAt: Date | null };

export type NewBoard = Pick<BoardRecord, "id" | "clientId" | "projectId" | "title" | "section" | "tags" | "searchText" | "objectCount" | "sceneBytes" | "template" | "createdById" | "updatedById"> & { scene: BoardScene; at: Date };

export type BoardVersionRow = { id: string; boardId: string; version: number; name: string | null; objectCount: number; createdById: string | null; createdByName: string | null; createdAt: Date };
export type BoardCommentRow = { id: string; boardId: string; elementId: string | null; authorId: string; authorName: string; body: string; createdAt: Date };
export type BoardReactionRow = { elementId: string; emoji: string; personId: string };
export type BoardVoteRow = { elementId: string; personId: string };
export type BoardFileRow = { boardId: string; fileKey: string; contentType: string; fileProvider: StorageProvider; fileLocation: string; fileId: string; fileSize: number };

export interface BoardsRepository {
  create(row: NewBoard): Promise<void>;
  /** A board, archived or not. */
  find(id: string): Promise<BoardRecord | null>;
  scene(id: string): Promise<BoardScene | null>;
  /** Boards of these clients (and optionally one project); `q` matches the title or any text on the board. */
  list(filter: { clientIds: readonly string[]; projectId?: string; archived?: boolean; q?: string; personId: string; limit?: number }): Promise<BoardSummary[]>;
  update(id: string, patch: Partial<Pick<BoardRecord, "title" | "section" | "tags" | "projectId" | "voting" | "timer" | "archivedAt" | "updatedById">> & { at: Date }): Promise<void>;
  /** Saves only when the board is still at `baseVersion`; returns the new version, or null when someone else saved first. */
  saveScene(id: string, baseVersion: number, row: { scene: BoardScene; searchText: string; objectCount: number; sceneBytes: number; thumbnail?: string | null; updatedById: string; at: Date }): Promise<number | null>;

  setFavourite(boardId: string, personId: string, favourite: boolean): Promise<void>;
  markViewed(boardId: string, personId: string, at: Date): Promise<void>;

  addVersion(row: { id: string; boardId: string; version: number; scene: BoardScene; name: string | null; objectCount: number; createdById: string; at: Date }): Promise<void>;
  versions(boardId: string): Promise<BoardVersionRow[]>;
  version(id: string): Promise<(BoardVersionRow & { scene: BoardScene }) | null>;
  lastAutoVersionAt(boardId: string): Promise<Date | null>;

  votes(boardId: string, round: number): Promise<BoardVoteRow[]>;
  addVote(row: { id: string; boardId: string; round: number; elementId: string; personId: string; at: Date }): Promise<void>;
  /** Takes back one of this person's votes on that sticky; false when there was none. */
  removeVote(boardId: string, round: number, elementId: string, personId: string, at: Date): Promise<boolean>;

  reactions(boardId: string): Promise<BoardReactionRow[]>;
  /** Adds the reaction, or takes it back when the person already gave it; returns whether it is now on. */
  toggleReaction(row: { id: string; boardId: string; elementId: string; personId: string; emoji: string; at: Date }): Promise<boolean>;

  comments(boardId: string): Promise<BoardCommentRow[]>;
  comment(id: string): Promise<BoardCommentRow | null>;
  addComment(row: { id: string; boardId: string; elementId: string | null; authorId: string; body: string; at: Date }): Promise<void>;
  removeComment(id: string, at: Date): Promise<void>;

  /** Stage 13.2: stickies turned into tasks. */
  addTaskLink(row: { boardId: string; elementId: string; taskId: string; createdById: string; at: Date }): Promise<boolean>;
  taskLinks(boardId: string): Promise<Array<{ elementId: string; taskId: string }>>;

  addFile(row: BoardFileRow & { createdById: string; at: Date }): Promise<void>;
  file(boardId: string, fileKey: string): Promise<BoardFileRow | null>;
  fileKeys(boardId: string): Promise<string[]>;
}
