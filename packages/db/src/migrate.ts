import { createDatabase, closeDatabase } from "./index";

await createDatabase();
console.log("Database migrations applied.");
await closeDatabase();
