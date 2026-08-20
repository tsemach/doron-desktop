import { NextResponse } from "next/server";
import { authorizeContactsRequest } from "../../../../../lib/contacts/auth";
import { createContact } from "../../../../../lib/contacts/crud";

// POST /api/v1/contacts/desktop -- create (see docs/contact/design.md §6's
// interface table: `POST / -> Contact`). List lives at ./list/route.ts --
// split into two files rather than branching on body shape in one, since
// this repo's org/desktop/teams convention already keeps list and create as
// separate route files.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const authorization = await authorizeContactsRequest(token);
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const email = body?.email;
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name : undefined;
  const phone = typeof body?.phone === "string" ? body.phone : undefined;
  const organization = typeof body?.organization === "string" ? body.organization : undefined;

  const result = await createContact(authorization.actor, { name, email, phone, organization });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ contact: result.contact }, { status: 201 });
}
