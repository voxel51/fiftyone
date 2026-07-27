import { describe, expect, it } from "vitest";

import fixtures from "../__fixtures__/expressions.json";
import { ExpressionSyntaxError, parse, tryParse } from "./parse";
import { print } from "./print";
import type { Node } from "./types";

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

/** The offset of a token in the source, for asserting where an error points. */
const at = (source: string, token: string): number => source.indexOf(token);

describe("parse", () => {
  it("has fixtures to check", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("parses $name into the tree Python encoded", (fixture) => {
    expect(parse(fixture.python)).toEqual(fixture.ast);
  });

  it.each(cases)("round trips $name back to its source", (fixture) => {
    expect(normalize(print(parse(fixture.python)))).toBe(
      normalize(fixture.python),
    );
  });

  it("honors the variable names it is given", () => {
    expect(parse("Field('x')", { fieldVar: "Field" })).toEqual({
      t: "field",
      path: "x",
    });
  });

  describe("Python precedence", () => {
    it("binds & tighter than a comparison", () => {
      // Python reads this as `F('a') > (1 & F('b'))`, which is why the
      // idiomatic form needs its parentheses
      expect(parse("F('a') > 1 & F('b')")).toEqual({
        t: "call",
        op: "__gt__",
        self: { t: "field", path: "a" },
        args: [
          {
            t: "call",
            op: "__rand__",
            self: { t: "field", path: "b" },
            args: [{ t: "lit", v: 1 }],
            kwargs: {},
          },
        ],
        kwargs: {},
      });
    });

    it("binds & tighter than |", () => {
      const node = parse("F('a') | F('b') & F('c')");
      expect(node).toMatchObject({
        t: "call",
        op: "__or__",
        self: { t: "field", path: "a" },
        args: [{ t: "call", op: "__and__" }],
      });
    });

    it("binds arithmetic tighter than a comparison", () => {
      expect(parse("F('a') + 1 > 2")).toMatchObject({
        op: "__gt__",
        self: { op: "__add__" },
      });
    });

    it("binds * tighter than +", () => {
      expect(parse("F('a') + F('b') * 2")).toMatchObject({
        op: "__add__",
        args: [{ op: "__mul__" }],
      });
    });

    it("reads ** as right associative and tighter than *", () => {
      expect(parse("F('a') * F('b') ** 2")).toMatchObject({
        op: "__mul__",
        args: [{ op: "__pow__" }],
      });
    });

    it("chains same-precedence operators to the left", () => {
      expect(parse("F('a') + F('b') + F('c')")).toMatchObject({
        op: "__add__",
        self: { op: "__add__", self: { t: "field", path: "a" } },
        args: [{ t: "field", path: "c" }],
      });
    });
  });

  describe("reflected operators", () => {
    it("swaps self and argument when the left operand is a literal", () => {
      expect(parse("2 - F('a')")).toEqual({
        t: "call",
        op: "__rsub__",
        self: { t: "field", path: "a" },
        args: [{ t: "lit", v: 2 }],
        kwargs: {},
      });
    });

    it("leaves a literal-only division alone", () => {
      // the shape `datetime.utcfromtimestamp(<ms> / 1000)` relies on
      expect(parse("1000 / 2")).toEqual({
        t: "call",
        op: "__truediv__",
        self: { t: "lit", v: 1000 },
        args: [{ t: "lit", v: 2 }],
        kwargs: {},
      });
    });
  });

  describe("literals", () => {
    it("reads Python's singletons", () => {
      expect(parse("F('x') == None")).toMatchObject({
        args: [{ t: "lit", v: null }],
      });
      expect(parse("F('x') == True")).toMatchObject({
        args: [{ t: "lit", v: true }],
      });
      expect(parse("F('x') == False")).toMatchObject({
        args: [{ t: "lit", v: false }],
      });
    });

    it("reads a signed number as one literal", () => {
      expect(parse("F('x') > -1.5")).toMatchObject({
        args: [{ t: "lit", v: -1.5 }],
      });
    });

    it("reads a timedelta as milliseconds", () => {
      expect(parse("F('x') > timedelta(milliseconds=500)")).toMatchObject({
        args: [{ t: "lit", v: 500, as: "timedelta" }],
      });
    });

    it("reads keyword arguments", () => {
      expect(parse("F('x').map_values(default=1)")).toEqual({
        t: "call",
        op: "map_values",
        self: { t: "field", path: "x" },
        args: [],
        kwargs: { default: { t: "lit", v: 1 } },
      });
    });

    it("reads a quoted apostrophe", () => {
      expect(parse("F('x') == 'it\\'s'")).toMatchObject({
        args: [{ t: "lit", v: "it's" }],
      });
    });
  });

  describe("tryParse", () => {
    it("returns the tree when the source is good", () => {
      expect(tryParse("F('x')")).toEqual({ node: { t: "field", path: "x" } });
    });

    it.each([
      ["an unbalanced open paren", "(F('a') > 1", (s: string) => s.length],
      [
        "an unbalanced close paren",
        "F('a') > 1)",
        (s: string) => s.lastIndexOf(")"),
      ],
      ["an unknown name", "F('a') > bogus", (s: string) => at(s, "bogus")],
      ["an unterminated string", "F('a", (s: string) => at(s, "'a")],
      ["a trailing operator", "F('a') >", (s: string) => s.length],
      [
        "a trailing comma operator",
        "F('a').is_in([1, 2] +",
        (s: string) => s.length,
      ],
      ["a missing dict value", "E({'$gt': })", (s: string) => at(s, "}")],
    ])("reports %s with an offset at the bad token", (_, source, offset) => {
      const result = tryParse(source);
      expect(result).toHaveProperty("error");
      const { error } = result as { error: ExpressionSyntaxError };
      expect(error).toBeInstanceOf(ExpressionSyntaxError);
      expect(error.offset).toBe(offset(source));
    });

    it("does not swallow an unexpected character", () => {
      const result = tryParse("F('a') > 1 ?");
      expect(result).toHaveProperty("error");
      expect((result as { error: ExpressionSyntaxError }).error.offset).toBe(
        11,
      );
    });

    it("throws rather than returning for anything but a syntax error", () => {
      expect(() => parse("F('a') > 1")).not.toThrow();
    });
  });

  it("rejects a raw MongoDB argument that is not literal", () => {
    expect(tryParse("E({'$gt': [F('x'), 1]})")).toHaveProperty("error");
  });
});

describe("unquoted field paths", () => {
  it("accepts a bare path, as if it were quoted", () => {
    expect(parse("F(confidence)")).toEqual({ t: "field", path: "confidence" });
  });

  it("accepts a bare dotted path", () => {
    expect(parse("F(ground_truth.label)")).toEqual({
      t: "field",
      path: "ground_truth.label",
    });
  });

  it("still accepts the quoted form", () => {
    expect(parse('F("a b")')).toEqual({ t: "field", path: "a b" });
  });

  it("reads the same either way", () => {
    expect(parse("F(conf) > 0.5")).toEqual(parse('F("conf") > 0.5'));
  });

  it("still refuses an empty call", () => {
    expect(() => parse("F()")).toThrow(ExpressionSyntaxError);
  });
});

describe("builtin arguments", () => {
  it("round trips a builtin's extra arguments", () => {
    // `round(F("x"), 2)` must not silently become `round(F("x"))`
    const node = parse('round(F("x"), 2)');
    expect(print(node)).toBe("round(F('x'), 2)");
    expect(parse(print(node))).toEqual(node);
  });

  it("keeps argument-less builtins bare", () => {
    expect(print(parse('abs(F("x"))'))).toBe("abs(F('x'))");
  });
});
