import { ColorscaleInput, MaskColorInput } from "@fiftyone/relay";
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
import { getRGBColorFromPool, namedColorScales } from "../utils";
import { ControlGroupWrapper } from "../ShareStyledDiv";

const colorscaleSetting = selectorFamily<
  Omit<ColorscaleInput, "path"> | undefined,
  string
>({
  key: "colorscaleSetting",
  get:
    (path) =>
    ({ get }) => {
      const field = get(fos.colorScheme).colorscale?.find(
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
            colorscale: current?.colorscale?.filter(
              (item) => item.path !== path
            ),
          };
        }

        const setting = { ...newSetting, path };
        const colorscale = [...(current.colorscale || [])];

        let index = colorscale.findIndex((item) => item.path === path);

        if (index < 0) {
          index = 0;
          colorscale.push(setting);
        } else {
          colorscale[index] = setting;
        }

        return {
          ...current,
          colorscale,
        };
      });
    },
});

const Colorscale: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const activePath = useRecoilValue(activeColorPath);
  const [setting, setSetting] = useRecoilState(colorscaleSetting(activePath));

  const colorscaleValues = useMemo(
    () =>
      colorScheme.colorscale?.find((item) => item.path === activePath) ?? {
        path: activePath,
        name: null,
        list: null,
        rgb: null,
      },
    [colorScheme, activePath]
  );
  const [input, setInput] = React.useState(colorscaleValues?.name ?? "");
  const [tab, setTab] = React.useState(
    Boolean(colorscaleValues?.name && colorscaleValues?.name !== "")
      ? "name"
      : "list"
  );

  const initialListValue = colorscaleValues?.list ?? [];

  const defaultValue = {
    value: null,
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

  const onSyncUpdate = useCallback(
    (copy: MaskColorInput[]) => {
      if (copy) {
        setColorScheme((cur) => ({ ...cur, defaultMaskTargetsColors: copy }));
      }
    },
    [setColorScheme, colorScheme]
  );

  useEffect(() => {
    if (tab === "list") {
      // when list is active, set name to null
      // we use colorscale.name ?? colorscale.list to generate colorscale rgb list
      setSetting({ ...colorscaleValues, name: null });
    }
  }, [tab]);

  useEffect(() => {
    setInput(colorscaleValues?.name ?? "");
  }, [colorscaleValues.name]);

  console.info(colorscaleValues);

  //   useEffect(() => {
  //     if (!values) {
  //       if (
  //         !colorScheme.defaultMaskTargetsColors ||
  //         colorScheme.defaultMaskTargetsColors.length == 0
  //       ) {
  //         setColorScheme({
  //           ...colorScheme,
  //           defaultMaskTargetsColors: [defaultValue],
  //         });
  //       }
  //     }
  //   }, [values]);

  const state = useMemo(
    () => ({
      useColorscale: Boolean(
        colorscaleValues?.list && colorscaleValues.list.length > 0
      ),
    }),
    [colorScheme.defaultMaskTargetsColors]
  );

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
      {tab === "list" && <div>Define a custom colorscale:</div>}
    </div>
  );
};

export default Colorscale;
