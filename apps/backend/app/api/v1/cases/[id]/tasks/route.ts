import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../../lib/org/auth";
import { createTask, listTasksForCase } from "../../../../../../lib/tasks/crud";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const tasks = await listTasksForCase(authorization.actor, id);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { title?: string; description?: string; dueDate?: string } | null;
  if (!body?.title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const result = await createTask(authorization.actor, id, { title: body.title, description: body.description, dueDate: body.dueDate });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ task: result.task }, { status: 201 });
}
