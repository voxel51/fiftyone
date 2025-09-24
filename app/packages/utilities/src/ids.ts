/**
 * Utility to generate mongo-like ObjectId
 */
export function objectId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const random = "xxxxxxxxxx".replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
  const counter = (
    "000000" + Math.floor(Math.random() * 0xffffff).toString(16)
  ).slice(-6);
  return timestamp + random + counter;
}
