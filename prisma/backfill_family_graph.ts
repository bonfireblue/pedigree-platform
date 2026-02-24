import { prisma } from "../src/lib/db";

async function main() {
  // Use the earliest-created user as the founder for the default graph
  const founder = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!founder) throw new Error("NO_USERS_FOUND");

  // If a graph already exists, reuse it; otherwise create one.
  let graph = await prisma.familyGraph.findFirst({ orderBy: { createdAt: "asc" } });

  if (!graph) {
    graph = await prisma.familyGraph.create({
      data: {
        name: "Default Family",
        createdById: founder.id,
      },
    });
  }

  // Ensure founder membership exists
  const existingMembership = await prisma.membership.findUnique({
    where: { userId_familyGraphId: { userId: founder.id, familyGraphId: graph.id } },
  });

  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        userId: founder.id,
        familyGraphId: graph.id,
        role: "FOUNDER",
      },
    });
  }

  // Backfill any NULL familyGraphId values on Person
  const updated = await prisma.person.updateMany({
    where: { familyGraphId: null },
    data: { familyGraphId: graph.id },
  });

  console.log({
    graphId: graph.id,
    founderId: founder.id,
    peopleUpdated: updated.count,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });