import { ColorscaleListInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { isEmpty } from "lodash";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import Input from "../../Common/Input";
import RadioGroup from "../../Common/RadioGroup";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";
import ManualColorScaleList from "../controls/ManualColorScaleList";
import {
  getRGBColorFromPool,
  isValidFloatInput,
  namedColorScales,
} from "../utils";

const GlobalColorscale: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();

  const setting = useMemo(
    () =>
      colorScheme.defaultColorscale ?? {
        name: "viridis",
        list: [],
      },
    [colorScheme]
  );

  const [input, setInput] = React.useState(setting?.name ?? "");
  const [tab, setTab] = React.useState(
    Boolean(
      (setting?.name || setting?.name !== "") &&
        setting?.list &&
        setting?.list.length > 0
    )
      ? "list"
      : "name"
  );

  const defaultValue = {
    value: 0,
    color: getRGBColorFromPool(colorScheme.colorPool),
  };

  const onBlurName = useCallback((value: string) => {
    // validate name is a plotly named colorscale
    // we convert the input to correct cases

    if (namedColorScales.includes(value.toLowerCase())) {
      const newSetting = { ...setting, name: value.toLowerCase() };
      setColorScheme((s) => ({ ...s, defaultColorscale: newSetting }));
    } else {
      setInput("invalid colorscale name");
      setTimeout(() => {
        setInput(setting?.name || "");
      }, 1000);
    }
  }, []);

  const shouldShowAddButton = Boolean(
    setting?.list && setting?.list?.length && setting?.list?.length > 0
  );

  const onSyncUpdate = useCallback(
    (copy: ColorscaleListInput[]) => {
      if (copy && isValidFloatInput(copy)) {
        const prev = colorScheme.defaultColorscale ?? {};
        setColorScheme((c) => ({
          ...c,
          defaultColorscale: { ...prev, list: copy },
        }));
      }
    },
    [setColorScheme]
  );

  useEffect(() => {
    if (tab === "list") {
      // when list is active, set name to null
      // we use colorscale.name ?? colorscale.list to generate colorscale rgb list
      setColorScheme((c) => ({
        ...c,
        defaultColorscale: {
          name: null,
          list: c.defaultColorscale?.list ?? [defaultValue],
        },
      }));
    }
  }, [tab]);

  useEffect(() => {
    setInput(setting?.name ?? "");
  }, [setting.name]);

  useEffect(() => {
    if (!setting) {
      if (
        !colorScheme.defaultColorscale ||
        isEmpty(colorScheme.defaultColorscale)
      ) {
        setColorScheme({
          ...colorScheme,
          defaultColorscale: {
            name: "viridis",
            list: [defaultValue],
          },
        });
      }
    }
  }, [setting]);

  return (
    <div>
      <RadioGroup
        choices={["name", "list"]}
        value={tab}
        setValue={(mode) => {
          setTab(mode);
        }}
        horizontal
      />
      {tab === "name" && (
        <div>
          Use a named plotly colorscale:
          <Input
            value={input}
            setter={(v) => setInput(v)}
            placeholder="(e.g. viridis, rdbu)"
            onBlur={() => onBlurName(input)}
            onEnter={() => onBlurName(input)}
            style={{
              width: 250,
              margin: 3,
            }}
          />
        </div>
      )}
      {tab === "list" && (
        <div>
          Define a custom colorscale:
          <ManualColorScaleList
            initialValue={
              setting?.list && setting?.list.length > 0
                ? setting.list
                : ([defaultValue] as ColorscaleListInput[])
            }
            values={setting?.list as ColorscaleListInput[]}
            style={FieldCHILD_STYLE}
            onValidate={validateFloat}
            onSyncUpdate={onSyncUpdate}
            shouldShowAddButton={shouldShowAddButton}
            step={0.01}
          />
        </div>
      )}
    </div>
  );
};

export default GlobalColorscale;

const validateFloat = (n: number) => {
  // 1 and 1.0 should both pass
  return Number.isFinite(n);
};
