/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect } from "vitest";
import { KeyParser } from "./parser";

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
    // \\+ binds to =
    result = KeyParser.parseBinding("meta+\\+");
    expect(result.length).toEqual(1);
    expect(result[0].isAlt).toBeFalsy();
    expect(result[0].isCtrl).toBeFalsy();
    expect(result[0].isMeta).toBeTruthy();
    expect(result[0].isShift).toBeFalsy();
    expect(result[0].key).toEqual("=");

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

    expect(result.length).toEqual(2);
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
    expect(result[1].key).toEqual("=");

    expect(result.length).toEqual(2);
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
      `The binding ${binding} contains an invalid key ${binding}`
    );
    binding = "ctrl+foo";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(
      `The binding ${binding} contains an invalid key ${binding.substring(
        binding.length - 3
      )}`
    );
    binding = "foo+ctrl";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(
      `The binding ${binding} contains an invalid key ${binding.substring(
        0,
        3
      )}`
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
    }).toThrowError(`The binding ${binding} countains an empty sequence`);
    binding = "    ";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} countains an empty sequence`);
    binding = "ctrl+m,,CTRL+p";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} countains an empty sequence`);
    binding = "ctrl+m,CTRL+p,";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} countains an empty sequence`);
    binding = ",ctrl+m,CTRL+p";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`The binding ${binding} countains an empty sequence`);
    binding = "s+d";
    expect(() => {
      KeyParser.parseBinding(binding);
    }).toThrowError(`Multiple standard keys in keybinding: ${binding}`);
  });
});
