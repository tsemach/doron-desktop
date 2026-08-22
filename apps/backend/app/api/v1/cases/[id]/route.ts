import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { deleteCase, getVisibleCaseById, updateCase } from "../../../../../lib/cases/crud";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const row = await getVisibleCaseById(authorization.actor, id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ case: row });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: string; subject?: string; status?: string } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await updateCase(authorization.actor, id, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ case: result.case });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const result = await deleteCase(authorization.actor, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
