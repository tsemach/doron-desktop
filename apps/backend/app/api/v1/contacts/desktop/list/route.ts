import { NextResponse } from "next/server";
import { authorizeContactsRequest } from "../../../../../../lib/contacts/auth";
import { listVisibleContacts } from "../../../../../../lib/contacts/crud";

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

  const contacts = await listVisibleContacts(authorization.actor);
  return NextResponse.json({ contacts });
}
