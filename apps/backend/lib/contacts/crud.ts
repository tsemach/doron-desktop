import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../database";
import { contactShares, contacts, users } from "../../database/schema";
import type { ContactActor } from "./auth";

type ContactRow = typeof contacts.$inferSelect;
export type ContactSource = ContactRow["source"];

export interface ContactEntry {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  source: ContactSource;
  ownedByMe: boolean;
  canEdit: boolean;
  updatedByUserId: string | null;
  sharedWith: string[];
  createdAt: Date;
  updatedAt: Date;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toContactEntry(row: ContactRow, ownedByMe: boolean, canEdit: boolean, sharedWith: string[]): ContactEntry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    organization: row.organization,
    source: row.source,
    ownedByMe,
    canEdit,
    updatedByUserId: row.updatedByUserId,
    sharedWith,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface VisibleRow {
  row: ContactRow;
  ownedByMe: boolean;
}

// Shared visibility check backing listVisibleContacts, getContactsByIds, and
// (via a single-id lookup) updateContact's "can edit" gate -- see
// docs/contact/design.md §5. Flat: every accountType='flat' row, no
// ownership filter. Firm: rows the actor owns, UNION rows reachable through
// a still-live contactShares row -- "live" meaning the owner's and
// recipient's *current* firmId still match, re-checked on every call rather
// than trusted from share-creation time (owner.firmId = recipient.firmId
// below is re-derived from `users` on each read).
//
// Optionally restricted to `ids` for getContactsByIds / single-id lookups --
// pushed into the SQL rather than filtered client-side for efficiency
// against the (potentially large) flat pool.
async function getVisibleContactRows(actor: ContactActor, ids?: string[]): Promise<VisibleRow[]> {
  if (ids && ids.length === 0) return [];

  if (actor.accountType === "flat") {
    const condition = ids ? and(eq(contacts.accountType, "flat"), inArray(contacts.id, ids)) : eq(contacts.accountType, "flat");
    const rows = await db.select().from(contacts).where(condition);
    return rows.map((row) => ({ row, ownedByMe: row.userId === actor.id }));
  }

  const ownedCondition = ids ? and(eq(contacts.userId, actor.id), inArray(contacts.id, ids)) : eq(contacts.userId, actor.id);
  const owned = await db.select().from(contacts).where(ownedCondition);

  const ownerUsers = alias(users, "contact_owner_users");
  const recipientUsers = alias(users, "contact_recipient_users");
  const sharedCondition = ids
    ? and(eq(contactShares.sharedWithUserId, actor.id), eq(ownerUsers.firmId, recipientUsers.firmId), inArray(contactShares.contactId, ids))
    : and(eq(contactShares.sharedWithUserId, actor.id), eq(ownerUsers.firmId, recipientUsers.firmId));

  const sharedRows = await db
    .select({ contact: contacts })
    .from(contactShares)
    .innerJoin(contacts, eq(contacts.id, contactShares.contactId))
    .innerJoin(ownerUsers, eq(ownerUsers.id, contacts.userId))
    .innerJoin(recipientUsers, eq(recipientUsers.id, contactShares.sharedWithUserId))
    .where(sharedCondition);

  const byId = new Map<string, VisibleRow>();
  for (const row of owned) byId.set(row.id, { row, ownedByMe: true });
  for (const { contact } of sharedRows) {
    if (!byId.has(contact.id)) byId.set(contact.id, { row: contact, ownedByMe: false });
  }
  return Array.from(byId.values());
}

// Current live recipients for a set of contacts the caller owns -- same
// live-firm-check as getVisibleContactRows, applied in the other direction
// (owner looking at who they've shared with, rather than a recipient
// looking for what's shared with them).
async function getLiveSharesForOwnedContacts(contactIds: string[]): Promise<Map<string, string[]>> {
  if (contactIds.length === 0) return new Map();

  const ownerUsers = alias(users, "contact_owner_users");
  const recipientUsers = alias(users, "contact_recipient_users");
  const rows = await db
    .select({ contactId: contactShares.contactId, sharedWithUserId: contactShares.sharedWithUserId })
    .from(contactShares)
    .innerJoin(contacts, eq(contacts.id, contactShares.contactId))
    .innerJoin(ownerUsers, eq(ownerUsers.id, contacts.userId))
    .innerJoin(recipientUsers, eq(recipientUsers.id, contactShares.sharedWithUserId))
    .where(and(inArray(contactShares.contactId, contactIds), eq(ownerUsers.firmId, recipientUsers.firmId)));

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.contactId) ?? [];
    list.push(r.sharedWithUserId);
    map.set(r.contactId, list);
  }
  return map;
}

async function attachSharedWith(actor: ContactActor, visible: VisibleRow[]): Promise<ContactEntry[]> {
  const ownedIds = visible.filter((v) => v.ownedByMe).map((v) => v.row.id);
  const sharedWithByContact = actor.accountType === "firm" ? await getLiveSharesForOwnedContacts(ownedIds) : new Map<string, string[]>();
  // Everyone in the visible set can edit -- ownership or a live share is
  // exactly what getVisibleContactRows already required to include the row
  // (design.md §5: edit uses the same "can see it" check as listing).
  return visible.map(({ row, ownedByMe }) => toContactEntry(row, ownedByMe, true, sharedWithByContact.get(row.id) ?? []));
}

// Flat: all rows where accountType='flat'. Firm: rows owned by the actor,
// UNION rows currently shared with them by a same-firm owner.
export async function listVisibleContacts(actor: ContactActor): Promise<ContactEntry[]> {
  const visible = await getVisibleContactRows(actor);
  return attachSharedWith(actor, visible);
}

// Authorization-filtered batch fetch -- silently drops any id the actor can
// no longer see rather than erroring (used by the desktop's local
// case_contacts -> backend batch resolve, design.md §8's partial-visibility
// note).
export async function getContactsByIds(actor: ContactActor, ids: string[]): Promise<ContactEntry[]> {
  const visible = await getVisibleContactRows(actor, ids);
  return attachSharedWith(actor, visible);
}

// After create/update/share, the actor performing the mutation always has
// edit access to the resulting row by construction (they either just
// created/own it, or the flat pool is collaborative by default) -- no need
// to re-run the visibility check for the response.
async function buildMutationResultEntry(actor: ContactActor, row: ContactRow): Promise<ContactEntry> {
  const ownedByMe = row.userId === actor.id;
  const sharedWith =
    ownedByMe && actor.accountType === "firm" ? (await getLiveSharesForOwnedContacts([row.id])).get(row.id) ?? [] : [];
  return toContactEntry(row, ownedByMe, true, sharedWith);
}

export interface CreateContactFields {
  name?: string;
  email: string;
  phone?: string;
  organization?: string;
  // ASC-176: set when this create/re-import came from the Google Contacts
  // picker (source='google'); left undefined for every other source. On a
  // re-import upsert, COALESCE below keeps whatever value the row already
  // had if this call doesn't pass one, so a manual edit/re-create of the
  // same email never clobbers a previously-recorded google_contact_id.
  googleContactId?: string;
}

export type CreateContactResult = { contact: ContactEntry } | { error: string; status: number };

// Duplicate email for the actor's owner/pool upserts the existing row's
// other fields instead of erroring (design.md §3.2) -- backed by the two
// partial unique indexes on `contacts` (contacts_email_flat_uniq /
// contacts_email_firm_uniq). `source` defaults to 'manual' (the only value
// the API route passes today); email/case_creation/google sources come
// from later PRs calling this same function directly with a different value.
export async function createContact(
  actor: ContactActor,
  fields: CreateContactFields,
  source: ContactSource = "manual"
): Promise<CreateContactResult> {
  const emailNorm = normalizeEmail(fields.email);
  if (!emailNorm) {
    return { error: "Email is required", status: 400 };
  }

  const insertValues = {
    userId: actor.id,
    accountType: actor.accountType,
    name: fields.name ?? null,
    email: fields.email.trim(),
    emailNorm,
    phone: fields.phone ?? null,
    organization: fields.organization ?? null,
    source,
    googleContactId: fields.googleContactId ?? null,
  };

  const updateOnConflict = {
    name: insertValues.name,
    email: insertValues.email,
    phone: insertValues.phone,
    organization: insertValues.organization,
    // COALESCE, not a plain overwrite -- see CreateContactFields.googleContactId's
    // comment: a non-Google create/update of an already-imported email must
    // not null out the existing google_contact_id.
    googleContactId: sql`COALESCE(excluded.google_contact_id, contacts.google_contact_id)`,
    updatedByUserId: actor.id,
    updatedAt: new Date(),
  };

  // Conflict target must match one of the two partial unique indexes
  // exactly (columns + predicate) -- flat's is global on emailNorm alone,
  // firm's is scoped per-owner via (userId, emailNorm). A flat upsert can
  // therefore land on a contact owned by a *different* flat user (the
  // global pool, by design); a firm upsert can only ever land on the
  // actor's own row, since the insert's own userId is part of the target.
  const [contact] =
    actor.accountType === "flat"
      ? await db
          .insert(contacts)
          .values(insertValues)
          .onConflictDoUpdate({
            target: contacts.emailNorm,
            targetWhere: sql`account_type = 'flat'`,
            set: updateOnConflict,
          })
          .returning()
      : await db
          .insert(contacts)
          .values(insertValues)
          .onConflictDoUpdate({
            target: [contacts.userId, contacts.emailNorm],
            targetWhere: sql`account_type = 'firm'`,
            set: updateOnConflict,
          })
          .returning();

  return { contact: await buildMutationResultEntry(actor, contact) };
}

export interface UpdateContactFields {
  name?: string;
  phone?: string;
  organization?: string;
}

export type UpdateContactResult = { contact: ContactEntry } | { error: string; status: number };

// Edit is not owner-gated -- allowed for the owner or any current live-share
// recipient, i.e. anyone getVisibleContactRows would include (design.md §5).
export async function updateContact(actor: ContactActor, id: string, fields: UpdateContactFields): Promise<UpdateContactResult> {
  const [access] = await getVisibleContactRows(actor, [id]);
  if (!access) {
    return { error: "Not found or access denied", status: 404 };
  }

  const [updated] = await db
    .update(contacts)
    .set({
      name: fields.name ?? access.row.name,
      phone: fields.phone ?? access.row.phone,
      organization: fields.organization ?? access.row.organization,
      updatedByUserId: actor.id,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, id))
    .returning();

  return { contact: await buildMutationResultEntry(actor, updated) };
}

export type DeleteContactResult = { success: true } | { error: string; status: number };

// Owner-only -- cascades contact_shares automatically via the FK, revoking
// every recipient's access. 403 (not 404) if the actor can see the contact
// but doesn't own it (e.g. any flat contact, or a firm contact shared with
// them); 404 if they can't see it at all.
export async function deleteContact(actor: ContactActor, id: string): Promise<DeleteContactResult> {
  const [existing] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }
  if (existing.userId !== actor.id) {
    const [access] = await getVisibleContactRows(actor, [id]);
    if (!access) {
      return { error: "Not found", status: 404 };
    }
    return { error: "Only the owner can delete this contact", status: 403 };
  }

  await db.delete(contacts).where(eq(contacts.id, id));
  return { success: true };
}

export type ShareContactResult = { contact: ContactEntry } | { error: string; status: number };

// Owner-only; recipient must currently be in the same firm as the actor
// (design.md §5 step 2) -- the one hard role/firm check in this whole
// feature. onConflictDoNothing so re-sharing with someone already shared
// with is a no-op, not an error.
//
// Ownership is checked via getVisibleContactRows rather than an unfiltered
// select-by-id, same as deleteContact -- an unfiltered lookup would leak
// whether a given contact UUID exists at all to any authenticated caller
// (e.g. a different firm entirely), which violates this app's "no
// cross-firm data, ever" guarantee (see firms' doc comment in
// packages/backend-orm/src/schema.ts) even for a 403 error response.
export async function shareContact(actor: ContactActor, contactId: string, recipientUserId: string): Promise<ShareContactResult> {
  if (actor.accountType === "flat") {
    return { error: "Sharing is not available for flat accounts", status: 400 };
  }

  const [access] = await getVisibleContactRows(actor, [contactId]);
  if (!access) {
    return { error: "Not found", status: 404 };
  }
  if (!access.ownedByMe) {
    return { error: "Only the owner can share this contact", status: 403 };
  }
  const existing = access.row;

  const [recipient] = await db
    .select({ id: users.id, firmId: users.firmId })
    .from(users)
    .where(and(eq(users.id, recipientUserId), isNull(users.deletedAt)))
    .limit(1);
  if (!recipient || !recipient.firmId || !actor.firmId || recipient.firmId !== actor.firmId) {
    return { error: "Can only share with someone in your own firm", status: 403 };
  }

  await db
    .insert(contactShares)
    .values({ contactId, sharedWithUserId: recipientUserId, sharedByUserId: actor.id })
    .onConflictDoNothing();

  return { contact: await buildMutationResultEntry(actor, existing) };
}

export type UnshareContactResult = { success: true } | { error: string; status: number };

// Owner-only, deletes the contact_shares row -- revokes the recipient's
// access immediately. Same visibility-first ownership check as
// deleteContact/shareContact -- see shareContact's comment above.
export async function unshareContact(actor: ContactActor, contactId: string, recipientUserId: string): Promise<UnshareContactResult> {
  const [access] = await getVisibleContactRows(actor, [contactId]);
  if (!access) {
    return { error: "Not found", status: 404 };
  }
  if (!access.ownedByMe) {
    return { error: "Only the owner can manage sharing for this contact", status: 403 };
  }

  await db.delete(contactShares).where(and(eq(contactShares.contactId, contactId), eq(contactShares.sharedWithUserId, recipientUserId)));
  return { success: true };
}
