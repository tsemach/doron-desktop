import { NextResponse } from "next/server";
import { authorizeContactsRequest } from "../../../../../../lib/contacts/auth";
import { updateContact } from "../../../../../../lib/contacts/crud";

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

  const id = body?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name : undefined;
  const phone = typeof body?.phone === "string" ? body.phone : undefined;
  const organization = typeof body?.organization === "string" ? body.organization : undefined;

  const result = await updateContact(authorization.actor, id, { name, phone, organization });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ contact: result.contact });
}
