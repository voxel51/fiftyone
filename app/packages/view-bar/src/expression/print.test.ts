import { describe, expect, it } from "vitest";

import fixtures from "../__fixtures__/expressions.json";
import { print } from "./print";
import { isReconstructible, type Node } from "./types";

interface Fixture {
  name: string;
  python: string;
  ast: Node;
  mongo: unknown;
  reconstructible: boolean;
}

const cases = fixtures as unknown as Fixture[];

/**
 * Python distinguishes `2` from `2.0` and the tree does not, so a whole-valued
 * float renders without its trailing `.0`. Compare with that difference
 * normalized away rather than pretending the App can recover it.
 */
const normalize = (source: string): string => source.replace(/\.0\b/g, "");

describe("print", () => {
  it("has fixtures to check", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("renders $name as the Python that generated it", (fixture) => {
    expect(normalize(print(fixture.ast))).toBe(normalize(fixture.python));
  });

  it.each(cases)(
    "agrees with Python on whether $name is reconstructible",
    (fixture) => {
      expect(isReconstructible(fixture.ast)).toBe(fixture.reconstructible);
    },
  );

  it("honors the variable names it is given", () => {
    const field: Node = { t: "field", path: "x" };
    expect(print(field, { fieldVar: "Field" })).toBe("Field('x')");
  });
});
