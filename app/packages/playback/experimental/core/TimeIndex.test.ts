import { describe, expect, it } from "vitest";
import { TimeIndex } from "./TimeIndex";

describe("TimeIndex", () => {
  describe("initial state", () => {
    it("starts empty", () => {
      const idx = new TimeIndex();
      expect(idx.isEmpty).toBe(true);
      expect(idx.size).toBe(0);
      expect(idx.times).toEqual([]);
    });
  });

  describe("addTimes", () => {
    it("adds and sorts times", () => {
      const idx = new TimeIndex();
      idx.addTimes([5, 3, 1, 4, 2]);
      expect(idx.times).toEqual([1, 2, 3, 4, 5]);
      expect(idx.size).toBe(5);
      expect(idx.isEmpty).toBe(false);
    });

    it("deduplicates times", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 2, 3, 2, 1]);
      expect(idx.times).toEqual([1, 2, 3]);
    });

    it("merges with existing times", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 3, 5]);
      idx.addTimes([2, 4, 6]);
      expect(idx.times).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("handles duplicates across merges", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 3, 5]);
      idx.addTimes([3, 5, 7]);
      expect(idx.times).toEqual([1, 3, 5, 7]);
    });

    it("ignores empty array", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 2]);
      idx.addTimes([]);
      expect(idx.times).toEqual([1, 2]);
    });
  });

  describe("getNextTime", () => {
    it("returns the next time strictly after the given value", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 5, 10, 15, 20]);

      expect(idx.getNextTime(0)).toBe(1);
      expect(idx.getNextTime(1)).toBe(5);
      expect(idx.getNextTime(5)).toBe(10);
      expect(idx.getNextTime(7)).toBe(10);
      expect(idx.getNextTime(15)).toBe(20);
    });

    it("returns undefined when no next time exists", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 5, 10]);

      expect(idx.getNextTime(10)).toBeUndefined();
      expect(idx.getNextTime(100)).toBeUndefined();
    });

    it("returns undefined for empty index", () => {
      const idx = new TimeIndex();
      expect(idx.getNextTime(0)).toBeUndefined();
    });

    it("handles single-element index", () => {
      const idx = new TimeIndex();
      idx.addTimes([5]);

      expect(idx.getNextTime(4)).toBe(5);
      expect(idx.getNextTime(5)).toBeUndefined();
    });
  });

  describe("getPrevTime", () => {
    it("returns the previous time strictly before the given value", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 5, 10, 15, 20]);

      expect(idx.getPrevTime(20)).toBe(15);
      expect(idx.getPrevTime(15)).toBe(10);
      expect(idx.getPrevTime(10)).toBe(5);
      expect(idx.getPrevTime(7)).toBe(5);
      expect(idx.getPrevTime(5)).toBe(1);
    });

    it("returns undefined when no previous time exists", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 5, 10]);

      expect(idx.getPrevTime(1)).toBeUndefined();
      expect(idx.getPrevTime(0)).toBeUndefined();
    });

    it("returns undefined for empty index", () => {
      const idx = new TimeIndex();
      expect(idx.getPrevTime(10)).toBeUndefined();
    });

    it("handles single-element index", () => {
      const idx = new TimeIndex();
      idx.addTimes([5]);

      expect(idx.getPrevTime(6)).toBe(5);
      expect(idx.getPrevTime(5)).toBeUndefined();
    });
  });

  describe("getMinTime / getMaxTime", () => {
    it("returns min and max for populated index", () => {
      const idx = new TimeIndex();
      idx.addTimes([10, 5, 20, 1, 15]);

      expect(idx.getMinTime()).toBe(1);
      expect(idx.getMaxTime()).toBe(20);
    });

    it("returns undefined for empty index", () => {
      const idx = new TimeIndex();
      expect(idx.getMinTime()).toBeUndefined();
      expect(idx.getMaxTime()).toBeUndefined();
    });

    it("returns same value for single-element index", () => {
      const idx = new TimeIndex();
      idx.addTimes([42]);
      expect(idx.getMinTime()).toBe(42);
      expect(idx.getMaxTime()).toBe(42);
    });
  });

  describe("getRange", () => {
    it("returns [min, max] for populated index", () => {
      const idx = new TimeIndex();
      idx.addTimes([3, 1, 7, 5]);
      expect(idx.getRange()).toEqual([1, 7]);
    });

    it("returns undefined for empty index", () => {
      const idx = new TimeIndex();
      expect(idx.getRange()).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all registered times", () => {
      const idx = new TimeIndex();
      idx.addTimes([1, 2, 3]);
      idx.clear();

      expect(idx.isEmpty).toBe(true);
      expect(idx.size).toBe(0);
      expect(idx.times).toEqual([]);
    });
  });

  describe("binary search correctness with large dataset", () => {
    it("finds correct next/prev in a large sorted array", () => {
      const idx = new TimeIndex();
      // Add even numbers 0..998
      const evens = Array.from({ length: 500 }, (_, i) => i * 2);
      idx.addTimes(evens);

      // Next after 99 should be 100
      expect(idx.getNextTime(99)).toBe(100);
      // Next after 100 should be 102
      expect(idx.getNextTime(100)).toBe(102);
      // Prev before 101 should be 100
      expect(idx.getPrevTime(101)).toBe(100);
      // Prev before 100 should be 98
      expect(idx.getPrevTime(100)).toBe(98);
    });
  });
});
