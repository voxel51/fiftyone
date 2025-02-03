import { MongoClient } from "mongodb";

/**
 * Deletes a database with the given name.
 */
export async function deleteDatabase(dbName: string): Promise<void> {
  if (!dbName) return;

  const mongoUrl = process.env.MONGODB_URL || "mongodb://127.0.0.1:27017";
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    await client.db(dbName).dropDatabase();
    console.log(`Successfully dropped database "${dbName}"`);
  } catch (err) {
    console.warn(`Failed to drop database "${dbName}":`, err);
  } finally {
    await client.close();
  }
}
