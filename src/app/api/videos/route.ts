import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const videos = await db.videoProject.findMany({
    include: { niche: true, scenes: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ videos });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.videoProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  if (!id || !status)
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  const updated = await db.videoProject.update({
    where: { id },
    data: { status },
  });
  return NextResponse.json({ video: updated });
}
