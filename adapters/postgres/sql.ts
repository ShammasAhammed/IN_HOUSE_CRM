import { getTableName, sql, type Column, type SQL } from "drizzle-orm";

/**
 * A column written with its table name, always: "clients"."id".
 * Drizzle leaves columns unqualified in single-table selects, so inside a correlated subquery an unqualified
 * outer column silently binds to the inner table. Every correlated subquery uses q() for BOTH sides.
 */
export function q(column: Column): SQL {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}

/**
 * Stage 14.1: `column` (a client id) is not a private space this person is outside of. Every scope that isn't the
 * owner's runs through this, so seeing "all clients" never means seeing private spaces.
 */
export function notHiddenFrom(column: Column, personId: string): SQL {
  return sql`${q(column)} not in (select hs.id from clients hs where hs.is_private and not exists
    (select 1 from client_members hm where hm.client_id = hs.id and hm.person_id = ${personId} and ${liveMember("hm")}))`;
}

/**
 * A membership that counts now (Stage 14.2): not removed, and not past its last day in India. Memberships are made only
 * when the member confirms ("I understand"), so a row that counts is always a confirmed one.
 */
export function liveMember(alias: string): SQL {
  return sql.raw(`${alias}.deleted_at is null and (${alias}.expires_on is null or ${alias}.expires_on >= (now() at time zone 'Asia/Kolkata')::date)`);
}
