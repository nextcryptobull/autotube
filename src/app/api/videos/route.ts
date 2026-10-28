import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/get-user";

export async function GET() {
  const userId = await getCurrentUserId();

  // Show user's own videos + orphaned videos (userId=null, from before accounts)
  const where = userId
    ? { OR: [{ userId }, { userId: null }] }
    : {};

  const videos = await db.videoProject.findMany({
    where,
    include: { niche: true, scenes: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ videos });
}

export async function DELETE(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.videoProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id, status, title, hook, scriptJson } = await req.json();
  if (!id)
    return NextResponse.json({ error: "id required" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (status) updateData.status = status;
  if (title) updateData.title = title;
  if (hook !== undefined) updateData.hook = hook;
  if (scriptJson !== undefined) updateData.scriptJson = scriptJson;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db.videoProject.update({
    where: { id },
    data: updateData,
    include: { niche: true, scenes: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ video: updated });
}
