import prisma from "../lib/prisma";

async function main() {
  const adAccount =
    await prisma.adAccount.upsert({
      where: {
        id: "act_366518141",
      },

      update: {
        name: "80t-shirt Main Ad Account",
        currency: "THB",
        timezone: "Asia/Bangkok",
        isActive: true,
      },

      create: {
        id: "act_366518141",
        name: "80t-shirt Main Ad Account",
        currency: "THB",
        timezone: "Asia/Bangkok",
        isActive: true,
      },
    });

  console.log("Ad Account saved:");
  console.log(adAccount);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });