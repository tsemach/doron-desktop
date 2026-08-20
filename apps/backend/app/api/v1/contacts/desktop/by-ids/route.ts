import { NextResponse } from "next/server";
import { authorizeContactsRequest } from "../../../../../../lib/contacts/auth";
import { getContactsByIds } from "../../../../../../lib/contacts/crud";

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

  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string") : null;
  if (!ids) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  const contacts = await getContactsByIds(authorization.actor, ids);
  return NextResponse.json({ contacts });
}
