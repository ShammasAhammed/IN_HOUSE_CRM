// Space kits (Stage 14.4): what a kit made in a space.
export type SpaceKitItemRow = { spaceId: string; kit: string; itemKey: string; entityType: string; entityId: string; createdAt: Date };

export interface SpaceKitsRepository {
  /** What this kit already made in this space. */
  done(spaceId: string, kit: string): Promise<SpaceKitItemRow[]>;
  /** Every space a kit was applied to, with how many items. */
  applied(): Promise<Array<{ spaceId: string; kit: string; items: number }>>;
  add(row: Omit<SpaceKitItemRow, "createdAt"> & { createdById: string; at: Date }): Promise<void>;
}
