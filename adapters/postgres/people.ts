import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { departments, people, personRoles } from "@/db/schema";
import type { PeopleRepository, PersonRecord } from "@/repositories";
import type { Role } from "@/lib/types";
import type { Db } from "./connection";
import { q } from "./sql";

const manager = alias(people, "manager");

const columns = {
  id: people.id,
  fullName: people.fullName,
  workEmail: people.workEmail,
  workPhone: people.workPhone,
  jobTitle: people.jobTitle,
  employmentType: people.employmentType,
  workLocation: people.workLocation,
  status: people.status,
  departmentId: people.departmentId,
  departmentName: departments.name,
  reportsToId: people.reportsToId,
  reportsToName: manager.fullName,
  capacityMinutesPerWeek: people.capacityMinutesPerWeek,
  joinDate: people.joinDate,
  endDate: people.endDate,
  avatarUrl: people.avatarUrl,
  roles: sql<Role[]>`coalesce((select array_agg(${q(personRoles.role)} order by ${q(personRoles.role)}) from ${personRoles}
    where ${q(personRoles.personId)} = ${q(people.id)} and ${q(personRoles.deletedAt)} is null), '{}')`,
};

export function peopleRepository(db: Db): PeopleRepository {
  const base = () =>
    db
      .select(columns)
      .from(people)
      .leftJoin(departments, eq(departments.id, people.departmentId))
      .leftJoin(manager, eq(manager.id, people.reportsToId));

  return {
    async findById(id) {
      const [row] = await base().where(and(eq(people.id, id), isNull(people.deletedAt))).limit(1);
      return (row as PersonRecord | undefined) ?? null;
    },
    async findByEmail(email) {
      const [row] = await base()
        .where(and(sql`lower(${q(people.workEmail)}) = lower(${email})`, isNull(people.deletedAt)))
        .limit(1);
      return (row as PersonRecord | undefined) ?? null;
    },
    async listActive() {
      const rows = await base()
        .where(and(eq(people.status, "active"), isNull(people.deletedAt)))
        .orderBy(asc(people.fullName));
      return rows as PersonRecord[];
    },
    async lockForUpdate(id) {
      await db.execute(sql`select 1 from ${people} where ${q(people.id)} = ${id} for update`);
      const [row] = await base().where(and(eq(people.id, id), isNull(people.deletedAt))).limit(1);
      return (row as PersonRecord | undefined) ?? null;
    },
    async listAll() {
      const rows = await base().where(isNull(people.deletedAt)).orderBy(asc(people.fullName));
      return rows as PersonRecord[];
    },
    async findPrivate(id) {
      const [row] = await db
        .select({
          personalEmail: people.personalEmail,
          personalPhone: people.personalPhone,
          emergencyContactName: people.emergencyContactName,
          emergencyContactPhone: people.emergencyContactPhone,
          emergencyContactRelation: people.emergencyContactRelation,
        })
        .from(people)
        .where(and(eq(people.id, id), isNull(people.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async create(id, person) {
      await db.insert(people).values({ id, ...person });
    },
    async update(id, patch) {
      await db
        .update(people)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(people.id, id));
    },
    async setRoles(id, roles) {
      // Soft-delete roles no longer held, restore or add the rest.
      await db
        .update(personRoles)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(personRoles.personId, id),
            isNull(personRoles.deletedAt),
            roles.length ? sql`${q(personRoles.role)} not in (${sql.join(roles.map((r) => sql`${r}`), sql`, `)})` : undefined,
          ),
        );
      if (roles.length === 0) return;
      await db
        .insert(personRoles)
        .values(roles.map((role) => ({ personId: id, role })))
        .onConflictDoUpdate({ target: [personRoles.personId, personRoles.role], set: { deletedAt: null } });
    },
    async addDepartment(id, row) {
      await db.insert(departments).values({ id, ...row });
    },
    async updateDepartment(id, patch) {
      await db.update(departments).set(patch).where(eq(departments.id, id));
    },
    async listDepartments() {
      return db
        .select({ id: departments.id, name: departments.name, headPersonId: departments.headPersonId })
        .from(departments)
        .where(isNull(departments.deletedAt))
        .orderBy(asc(departments.name));
    },
  };
}

