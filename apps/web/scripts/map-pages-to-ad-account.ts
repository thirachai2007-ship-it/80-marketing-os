import prisma from "../lib/prisma";

const AD_ACCOUNT_ID = "act_366518141";

const PAGE_IDS = [
  "263789240657264", // 80t-shirt รับสกรีนเสื้อยืด
  "554763461060330", // 80t-shirt รับผลิตเสื้อ
];

async function main() {
  const result = await prisma.managedPage.updateMany({
    where: {
      id: {
        in: PAGE_IDS,
      },
    },
    data: {
      adAccountId: AD_ACCOUNT_ID,
    },
  });

  console.log(
    `Mapped ${result.count} pages to ${AD_ACCOUNT_ID}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });