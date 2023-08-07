import { getStringifiedKwargs } from "../commands";
import { describe, expect, it } from "vitest";

describe("getStringifiedKwargs", () => {
  it("should return empty string if kwargs is empty", () => {
    expect(getStringifiedKwargs({})).toEqual("");
  });

  it("should return stringified kwargs if kwargs is not empty", () => {
    expect(
      getStringifiedKwargs({
        dataset_name: "quickstart",
      })
    ).toEqual(`, dataset_name="quickstart"`);
  });

  it("should return stringified kwargs with multiple kwargs", () => {
    expect(
      getStringifiedKwargs({
        dataset_name: "quickstart",
        other_kwarg: "other_value",
      })
    ).toEqual(`, dataset_name="quickstart", other_kwarg="other_value"`);
  });

  it("should return stringified kwargs with mixed data type kwargs", () => {
    expect(
      getStringifiedKwargs({
        dataset_name: "quickstart",
        int_kwarg: 20,
        bool_kwarg: true,
      })
    ).toEqual(`, dataset_name="quickstart", int_kwarg=20, bool_kwarg=True`);
  });
});
