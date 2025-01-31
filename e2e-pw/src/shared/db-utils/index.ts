import { MongoClient } from "mongodb";

/**
 * Deletes a database with the given name.
 */
export async function deleteDatabase(dbName: string): Promise<void> {
  if (!dbName) return;

  const client = new MongoClient("mongodb://127.0.0.1:27017");
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
