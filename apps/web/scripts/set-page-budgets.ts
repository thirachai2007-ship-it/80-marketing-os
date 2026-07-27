import prisma from "../lib/prisma";

async function main() {
  const updates = [
    {
      id: "554763461060330",
      budget: 2_000_000, // 20,000 บาท
    },
    {
      id: "263789240657264",
      budget: 1_600_000, // 16,000 บาท
    },
  ];

  for (const page of updates) {
    await prisma.managedPage.update({
      where: {
        id: page.id,
      },
      data: {
        forecastDailyBudgetSatang:
          page.budget,
      },
    });
  }

  console.log(
    "Forecast budgets updated successfully.",
  );

  const pages =
    await prisma.managedPage.findMany({
      where: {
        id: {
          in: updates.map(
            (page) => page.id,
          ),
        },
      },
      select: {
        id: true,
        name: true,
        forecastDailyBudgetSatang: true,
      },
    });

  console.table(pages);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });