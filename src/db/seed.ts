import { db } from ".";
import { adminOrganizers } from "./schema";

const initialOrganizers = [
  { name: "システム管理者", slug: "system-administrators" },
  { name: "サービス運営者", slug: "service-operators" },
];

async function seed() {
  await db.insert(adminOrganizers).values(initialOrganizers).onConflictDoNothing({ target: adminOrganizers.slug });
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
