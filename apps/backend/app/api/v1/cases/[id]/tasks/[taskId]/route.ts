import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../../../lib/org/auth";
import { deleteTask, updateTask, type TaskRow } from "../../../../../../../lib/tasks/crud";

type RouteParams = { params: Promise<{ id: string; taskId: string }> };

const VALID_STATUSES: TaskRow["status"][] = ["Waiting", "In progress", "Cancel", "Done"];

export async function PATCH(request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { taskId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { title?: string; description?: string; status?: string; dueDate?: string | null }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status as TaskRow["status"])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await updateTask(authorization.actor, taskId, {
    title: body.title,
    description: body.description,
    status: body.status as TaskRow["status"] | undefined,
    dueDate: body.dueDate,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ task: result.task });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { taskId } = await params;
  const result = await deleteTask(authorization.actor, taskId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
