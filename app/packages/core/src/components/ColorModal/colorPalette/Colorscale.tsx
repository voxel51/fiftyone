import {
  ColorscaleInput,
  ColorscaleListInput,
  MaskColorInput,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import {
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import Checkbox from "../../Common/Checkbox";
import Input from "../../Common/Input";
import RadioGroup from "../../Common/RadioGroup";
import { activeColorPath } from "../state";
import {
  getRGBColorFromPool,
  isValidFloatInput,
  namedColorScales,
} from "../utils";
import { ControlGroupWrapper, FieldCHILD_STYLE } from "../ShareStyledDiv";
import ManualColorScaleList from "../controls/ManualColorScaleList";
import { cloneDeep } from "lodash";

const colorscaleSetting = selectorFamily<
  Omit<ColorscaleInput, "path"> | undefined,
  string
>({
  key: "colorscaleSetting",
  get:
    (path) =>
    ({ get }) => {
      const field = get(fos.colorScheme).colorscales?.find(
        (field) => path === field.path
      );
      if (field) {
        const { path: _, ...setting } = field;
        return setting;
      }
      return undefined;
    },
  set:
    (path) =>
    ({ set }, newSetting) => {
      set(fos.colorScheme, (current) => {
        if (!newSetting || newSetting instanceof DefaultValue) {
          return {
            ...current,
            colorscales: current?.colorscales?.filter(
              (item) => item.path !== path
            ),
          };
        }

        const setting = { ...newSetting, path };
        const colorscales = [...(current.colorscales || [])];

        let index = colorscales.findIndex((item) => item.path === path);

        if (index < 0) {
          index = 0;
          colorscales.push(setting);
        } else {
          colorscales[index] = setting;
        }
        console.info("set colorscales in component", colorscales);
        return {
          ...current,
          colorscales,
        };
      });
    },
});

const Colorscale: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const activePath = useRecoilValue(activeColorPath);
  const [setting, setSetting] = useRecoilState(colorscaleSetting(activePath));

  console.info("setting", setting);
  const colorscaleValues = useMemo(
    () =>
      colorScheme.colorscales?.find((item) => item.path === activePath) ?? {
        path: activePath,
        name: null,
        list: null,
      },
    [colorScheme, activePath]
  );

  const [input, setInput] = React.useState(colorscaleValues?.name ?? "");
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
      setSetting({ ...colorscaleValues, name: value.toLowerCase() });
    } else {
      setInput("invalid colorscale name");
      setTimeout(() => {
        setInput(colorscaleValues?.name || "");
      }, 1000);
    }
  }, []);

  const shouldShowAddButton = Boolean(
    colorscaleValues?.list &&
      colorscaleValues?.list?.length &&
      colorscaleValues?.list?.length > 0
  );

  const index = useMemo(
    () => colorScheme.colorscales?.findIndex((s) => s.path == activePath),
    [activePath]
  );

  const onSyncUpdate = useCallback(
    (copy: ColorscaleListInput[]) => {
      if (copy && isValidFloatInput(copy)) {
        const newSetting = cloneDeep(colorScheme.colorscales ?? []);
        const idx = colorScheme.colorscales?.findIndex(
          (s) => s.path == activePath
        );
        if (idx !== undefined && idx > -1) {
          newSetting[idx].list = copy;
          setColorScheme({ ...colorScheme, colorscales: newSetting });
        } else {
          setColorScheme((cur) => ({
            ...cur,
            colorscales: [...newSetting, { path: activePath, list: copy }],
          }));
        }
      }
    },
    [index, setColorScheme, activePath]
  );

  useEffect(() => {
    if (tab === "list") {
      // when list is active, set name to null
      // we use colorscale.name ?? colorscale.list to generate colorscale rgb list
      setSetting((prev) => ({
        ...prev,
        name: null,
        list: prev?.list ?? [defaultValue],
      }));
    }
  }, [tab]);

  useEffect(() => {
    setInput(colorscaleValues?.name ?? "");
  }, [colorscaleValues.name]);

  useEffect(() => {
    if (!setting) {
      if (!colorScheme.colorscales || colorScheme.colorscales.length == 0) {
        setColorScheme({
          ...colorScheme,
          colorscales: [
            {
              path: activePath,
              name: "",
              list: [defaultValue],
            },
          ],
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

export default Colorscale;

const validateFloat = (n: number) => {
  // 1 and 1.0 should both pass
  return Number.isFinite(n);
};
