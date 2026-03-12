import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import {
  RelationshipError,
  assertCanEditRelationship,
  assertChildHasAtMostOneOtherParent,
  assertNoDuplicateParentChild,
  assertNoParentChildCycle,
  assertNoSpouseConflictWithParentChild,
  assertNonEmptyIds,
  assertNotSelf,
  assertSameFamilyGraph,
  getExactParentChildOrThrow,
  getParentChildDeleteWarnings,
  getTwoPeopleForRelationship,
} from "@/lib/relationshipRules";

export async function POST(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `rel:parent-child:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.ok) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const body = parsed.json;
    const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : "";
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";

    assertNonEmptyIds([parentId, childId]);
    assertNotSelf(parentId, childId);

    const { a: parent, b: child } = await getTwoPeopleForRelationship(parentId, childId);

    assertCanEditRelationship(me, parent, child);
    assertSameFamilyGraph(parent, child);

    await assertNoDuplicateParentChild(parentId, childId);
    await assertChildHasAtMostOneOtherParent(childId);
    await assertNoSpouseConflictWithParentChild(parentId, childId);
    await assertNoParentChildCycle(parentId, childId);

    const relationship = await prisma.parentChild.create({
      data: { parentId, childId },
      select: {
        id: true,
        parentId: true,
        childId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ relationship }, { status: 201 });
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/relationships/parent-child failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `rel:parent-child:delete:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.ok) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const body = parsed.json;
    const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : "";
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";
    const dryRun = body?.dryRun === true;

    assertNonEmptyIds([parentId, childId]);

    const { a: parent, b: child } = await getTwoPeopleForRelationship(parentId, childId);
    assertCanEditRelationship(me, parent, child);
    assertSameFamilyGraph(parent, child);

    const relationship = await getExactParentChildOrThrow(parentId, childId);
    const warnings = await getParentChildDeleteWarnings(parentId, childId);

    if (dryRun) {
      return NextResponse.json(
        {
          dryRun: true,
          relationship,
          warnings,
        },
        { status: 200 }
      );
    }

    await prisma.parentChild.delete({
      where: {
        parentId_childId: { parentId, childId },
      },
    });

    return NextResponse.json(
      {
        deleted: true,
        relationship,
        warnings,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("DELETE /api/relationships/parent-child failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}