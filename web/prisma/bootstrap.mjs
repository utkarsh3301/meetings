// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when the user table is empty.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = "Admin" } = process.env;

if ((await db.user.count()) === 0) {
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await db.user.create({
      data: {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL.toLowerCase(),
        role: "ADMIN",
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      },
    });
    console.log(`Created admin ${ADMIN_EMAIL}`);
  } else {
    console.log("No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin.");
  }
}
await db.$disconnect();
