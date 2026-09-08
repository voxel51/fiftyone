/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect } from "vitest";
import { KeyParser } from "./KeyParser";

describe("KeyParser", () => {
  it("can parse simple valid single sequence bindings", () => {
    let result = KeyParser.parseBinding("ctrl+s");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeTruthy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("s");
    result = KeyParser.parseBinding(" ctrl+ shift + Z");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeTruthy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeTruthy();
    expect(result[0].key).toEqual("z");
    result = KeyParser.parseBinding("alt + F2");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeTruthy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("f2");

    result = KeyParser.parseBinding("meta+ArrowUp ");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeTruthy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("arrowup");

    result = KeyParser.parseBinding("shift+     space ");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeTruthy();
    expect(result[0].key).toEqual(" ");
  });
  it("handles escape sequences correctly in single bindings", () => {
    let result = KeyParser.parseBinding("meta+\\,");
    // \\, binds to ","
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeTruthy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual(",");
    // \\ is handled
    result = KeyParser.parseBinding("meta+\\");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeTruthy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("\\");
    // \\+ binds to the literal "+"
    result = KeyParser.parseBinding("meta+\\+");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeTruthy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("+");

    result = KeyParser.parseBinding("space");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual(" ");
  });
  it("can parse multiple good bindings", () => {
    let result = KeyParser.parseBinding("ctrl+f,ctrl+d");
    expect(result.length).toEqual(2);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeTruthy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("f");
    expect(result[1].isAlt).toBeFalsy();
    expect(result[1].isCtrl).toBeTruthy();
    expect(result[1].isMeta).toBeFalsy();
    expect(result[1].isShift).toBeFalsy();
    expect(result[1].key).toEqual("d");

    result = KeyParser.parseBinding("ctrl+f,q");
    expect(result.length).toEqual(2);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeTruthy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("f");
    expect(result[1].isAlt).toBeFalsy();
    expect(result[1].isCtrl).toBeFalsy();
    expect(result[1].isMeta).toBeFalsy();
    expect(result[1].isShift).toBeFalsy();
    expect(result[1].key).toEqual("q");

    result = KeyParser.parseBinding("ctrl+f,  ctrl + d ");
    expect(result.length).toEqual(2);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeTruthy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("f");
    expect(result[1].isAlt).toBeFalsy();
    expect(result[1].isCtrl).toBeTruthy();
    expect(result[1].isMeta).toBeFalsy();
    expect(result[1].isShift).toBeFalsy();
    expect(result[1].key).toEqual("d");

    result = KeyParser.parseBinding("ctrl+\\,,shift+\\+");
    expect(result.length).toEqual(2);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeTruthy();
    expect(result[0].isMeta).toBeFalsy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual(",");
    expect(result[1].isAlt).toBeFalsy();
    expect(result[1].isCtrl).toBeFalsy();
    expect(result[1].isMeta).toBeFalsy();
    expect(result[1].isShift).toBeTruthy();
    expect(result[1].key).toEqual("+");

    result = KeyParser.parseBinding("f,q");
    expect(result.length).toEqual(2);
    result = KeyParser.parseBinding("ctrl+f,shift+ q, meta+z");
    expect(result.length).toEqual(3);
  });

  it("does not parse bad bindings (throws)", () => {
    let binding = "asdf";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(
      `The binding ${binding} contains an invalid key ${binding}`,
    );
    binding = "ctrl+foo";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(
      `The binding ${binding} contains an invalid key ${binding.substring(
        binding.length - 3,
      )}`,
    );
    binding = "foo+ctrl";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(
      `The binding ${binding} contains an invalid key ${binding.substring(
        0,
        3,
      )}`,
    );
    binding = "+";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} is missing a key.`);
    binding = "ctrl +";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} is missing a key.`);
    binding = "+ ctrl";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} is missing a key.`);
    binding = " ,";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} contains an empty sequence`);
    binding = "";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} contains an empty sequence`);
    binding = "    ";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} contains an empty sequence`);
    binding = "ctrl+m,,CTRL+p";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} contains an empty sequence`);
    binding = "ctrl+m,CTRL+p,";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} contains an empty sequence`);
    binding = ",ctrl+m,CTRL+p";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} contains an empty sequence`);
    binding = "s+d";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`Multiple standard keys in keybinding: ${binding}`);
  });

  it("round-trips toString output back through parseBinding", () => {
    // KeyManager stores bindings keyed by toString() and re-parses them on
    // every keystroke, so toString() must emit a parseable string. A literal
    // comma key must be re-escaped as "\," or parseBinding splits on it and
    // throws "contains an empty sequence".
    const bindings = [
      "meta+\\,",
      "ctrl+\\,,shift+\\+",
      "shift+space",
      "ctrl+s",
    ];
    for (const binding of bindings) {
      const normalized = KeyParser.parseBinding(binding)
        .map((s) => s.toString())
        .join(",");
      expect(() => KeyParser.parseBinding(normalized)).not.toThrow();
      const reparsed = KeyParser.parseBinding(normalized);
      const original = KeyParser.parseBinding(binding);
      expect(reparsed.length).toEqual(original.length);
      reparsed.forEach((seq, i) => {
        expect(seq.equals(original[i])).toBeTruthy();
      });
    }
  });
});

/**
 * The video Explore zoom bindings. Two of the four originally could never
 * fire: `"shift+\\+"` resolved to the key `"="` WITH shift, but a US layout
 * reports `event.key === "+"` for that press, and likewise `"_"` rather than
 * `"-"`. The matcher demands an exact modifier state, so each produced
 * character needs its own binding.
 */
describe("zoom bindings match the characters a layout actually produces", () => {
  const press = (key: string, shiftKey = false) =>
    ({
      key,
      shiftKey,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    }) as KeyboardEvent;

  const matchesAny = (bindings: string[], event: KeyboardEvent) =>
    bindings.some((binding) =>
      KeyParser.parseBinding(binding).some((sequence) =>
        sequence.matches(event),
      ),
    );

  const ZOOM_IN = ["=", "\\+", "shift+\\+"];
  const ZOOM_OUT = ["-", "_", "shift+_"];

  it("zooms in on a shifted '+' (US layout) and a bare '='", () => {
    expect(matchesAny(ZOOM_IN, press("+", true))).toBe(true);
    expect(matchesAny(ZOOM_IN, press("=", false))).toBe(true);
  });

  it("zooms in on an unshifted '+' (layouts with its own key)", () => {
    expect(matchesAny(ZOOM_IN, press("+", false))).toBe(true);
  });

  it("zooms out on a shifted '_' (US layout) and a bare '-'", () => {
    expect(matchesAny(ZOOM_OUT, press("_", true))).toBe(true);
    expect(matchesAny(ZOOM_OUT, press("-", false))).toBe(true);
  });

  it("does not cross the two directions", () => {
    expect(matchesAny(ZOOM_IN, press("-", false))).toBe(false);
    expect(matchesAny(ZOOM_OUT, press("=", false))).toBe(false);
  });

  it("ignores a shifted '=' , which produces '+' rather than '='", () => {
    // The original bug in one assertion: a binding for the key "=" with shift
    // is unreachable, because that press never reports "=".
    const shiftEquals = KeyParser.parseBinding("shift+\\+");
    expect(shiftEquals[0].key).toBe("+");
    expect(shiftEquals[0].isShift).toBe(true);
    expect(shiftEquals[0].matches(press("=", true))).toBe(false);
  });
});
