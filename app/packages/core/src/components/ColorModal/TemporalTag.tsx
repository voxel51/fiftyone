import { TemporalTagColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React from "react";
import { DefaultValue, selector, useRecoilState, useRecoilValue } from "recoil";
import Checkbox from "../Common/Checkbox";
import { SectionWrapper } from "./ShareStyledDiv";
import TemporalTagByValue from "./colorPalette/TemporalTagByValue";

const temporalTagSetting = selector<TemporalTagColorInput>({
  key: "temporalTagSetting",
  get: ({ get }) => get(fos.colorScheme).temporalTags || {},
  set: ({ set }, newSetting) => {
    set(fos.colorScheme, (current) => {
      if (!newSetting || newSetting instanceof DefaultValue) {
        throw new Error("not implemented");
      }

      return {
        ...current,
        temporalTags: newSetting,
      };
    });
  },
});

/**
 * Temporal-tag color settings. Temporal tags are always colored by value (tag
 * name), so this panel only offers per-value colors regardless of the global
 * color-by mode.
 */
const TemporalTag: React.FC = () => {
  const { colorPool } = useRecoilValue(fos.colorScheme);
  const [temporalTags, setSetting] = useRecoilState(temporalTagSetting);
  const useValueColors = Boolean(temporalTags?.valueColors?.length);

  return (
    <div>
      <form
        style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
      >
        <Checkbox
          name={`Use custom colors for specific temporal tag values`}
          value={useValueColors}
          setValue={(v: boolean) => {
            setSetting((cur) => {
              if (!cur) {
                cur = { valueColors: [] };
              }

              if (!cur?.valueColors?.length && v) {
                cur = {
                  ...cur,
                  valueColors: [
                    {
                      value: "",
                      color:
                        colorPool[Math.floor(Math.random() * colorPool.length)],
                    },
                  ],
                };
              } else if (!v) {
                cur = { ...cur, valueColors: [] };
              }

              return cur;
            });
          }}
        />
        <SectionWrapper>
          <TemporalTagByValue />
        </SectionWrapper>
      </form>
    </div>
  );
};

export default TemporalTag;
