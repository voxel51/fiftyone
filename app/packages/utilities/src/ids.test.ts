import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { objectId } from "./ids";

describe("objectId", () => {
  beforeEach(() => {
    // Mock Date.now to return a fixed timestamp
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should generate a 24-character hex string", () => {
    const id = objectId();
    expect(id).toHaveLength(24);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("should start with timestamp in hex format", () => {
    const id = objectId();
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    expect(id).toMatch(new RegExp(`^${timestamp}`));
  });

  it("should generate different IDs on multiple calls", () => {
    const id1 = objectId();
    const id2 = objectId();
    expect(id1).not.toBe(id2);
  });

  it("should generate consistent timestamp prefix for same time", () => {
    const id1 = objectId();
    const id2 = objectId();
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    expect(id1.startsWith(timestamp)).toBe(true);
    expect(id2.startsWith(timestamp)).toBe(true);
  });

  it("should have correct structure: timestamp(8) + random(10) + counter(6)", () => {
    const id = objectId();
    expect(id).toHaveLength(24);

    // Extract parts
    const timestamp = id.substring(0, 8);
    const random = id.substring(8, 18);
    const counter = id.substring(18, 24);

    // Verify each part is valid hex
    expect(timestamp).toMatch(/^[0-9a-f]{8}$/);
    expect(random).toMatch(/^[0-9a-f]{10}$/);
    expect(counter).toMatch(/^[0-9a-f]{6}$/);
  });

  it("should handle different timestamps correctly", () => {
    // Test with different timestamps
    const timestamps = [
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-12-31T23:59:59Z"),
      new Date("2023-06-15T12:30:45Z"),
    ];

    timestamps.forEach((date) => {
      vi.setSystemTime(date);
      const id = objectId();
      const expectedTimestamp = Math.floor(date.getTime() / 1000).toString(16);
      expect(id.startsWith(expectedTimestamp)).toBe(true);
    });
  });

  it("should generate valid hex characters only", () => {
    const id = objectId();
    expect(id).toMatch(/^[0-9a-f]+$/);
    expect(id).not.toMatch(/[g-z]/i);
  });

  it("should be deterministic in structure but random in content", () => {
    const ids = Array.from({ length: 100 }, () => objectId());

    // All should have same length
    ids.forEach((id) => expect(id).toHaveLength(24));

    // All should be valid hex
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f]+$/));

    // Should have some variation in the random parts
    const randomParts = ids.map((id) => id.substring(8));
    const uniqueRandomParts = new Set(randomParts);
    expect(uniqueRandomParts.size).toBeGreaterThan(1);
  });
});
