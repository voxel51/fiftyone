import React from "react";
import { act, renderHook } from "@testing-library/react-hooks";
import { RecoilRoot, useRecoilState, useRecoilValue } from "recoil";

import { afterEach, describe, expect, test, vi } from "vitest";
import * as fos from "@fiftyone/state";
import { FIELDS } from "../useSchemaSettings.utils.test";

const TEST_DS = {
  name: "test-dataset",
  mediaType: "image",
};

const Root: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <RecoilRoot
      initializeState={({ set }) => {
        set(fos.dataset, TEST_DS);
        set(fos.showNestedFieldsState, false);
        set(fos.excludedPathsState({}), {
          [TEST_DS.name]: [FIELDS.METADATA_FIELD.path],
        });
      }}
    >
      {children}
    </RecoilRoot>
  );
};

describe("useSetShowNestedFields hook used in schema code", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const schema = {
    [FIELDS.ID_FIELD.path]: FIELDS.ID_FIELD,
    [FIELDS.FILEPATH_FIELD.path]: FIELDS.FILEPATH_FIELD,
    [FIELDS.METADATA_FIELD.path]: FIELDS.METADATA_FIELD,
    [FIELDS.METADATA_WIDTH_FIELD.path]: FIELDS.METADATA_WIDTH_FIELD,
  };
  const frameSchema = {};

  test("when showNestedFields is true, excluded paths should include nested paths", async () => {
    const frameSchema = {};

    const { result } = renderHook(
      () => {
        const excludedPaths = useRecoilValue(fos.excludedPathsState({}));

        return {
          useSetShowNestedFields: fos.useSetShowNestedFields(
            schema,
            frameSchema
          ),
          excludedPaths,
        };
      },
      {
        wrapper: Root,
      }
    );

    expect(result.current.useSetShowNestedFields.showNestedFields).toBeFalsy();

    act(() => {
      result.current.useSetShowNestedFields.setShowNestedFields(true);
    });

    expect(result.current.useSetShowNestedFields.showNestedFields).toBeTruthy();
    expect(result.current.excludedPaths[TEST_DS.name]).toEqual(
      new Set([FIELDS.METADATA_FIELD.path, FIELDS.METADATA_WIDTH_FIELD.path])
    );
  });

  test("when showNestedFields is true, excluded paths should exclude nested paths", () => {
    const { result } = renderHook(
      () => {
        const [excludedPaths, setExcludedPaths] = useRecoilState(
          fos.excludedPathsState({})
        );

        return {
          useSetShowNestedFields: fos.useSetShowNestedFields(
            schema,
            frameSchema
          ),
          excludedPaths,
          setExcludedPaths,
        };
      },
      {
        wrapper: Root,
      }
    );

    expect(result.current.useSetShowNestedFields.showNestedFields).toBeFalsy();

    act(() => {
      result.current.setExcludedPaths({
        [TEST_DS.name]: [
          FIELDS.METADATA_FIELD.path,
          FIELDS.METADATA_WIDTH_FIELD.path,
        ],
      });
    });

    expect(result.current.excludedPaths[TEST_DS.name]).toBeDefined();
    expect(result.current.useSetShowNestedFields.showNestedFields).toBeFalsy();

    act(() => {
      result.current.useSetShowNestedFields.setShowNestedFields(false);
    });
    expect(result.current.excludedPaths[TEST_DS.name]).toEqual(
      new Set([FIELDS.METADATA_FIELD.path])
    );
  });
});
