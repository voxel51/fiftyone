import { ColorscaleInput, ColorscaleListInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { cloneDeep } from "lodash";
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
import {
  ControlGroupWrapper,
  FieldCHILD_STYLE,
  Guide,
} from "../ShareStyledDiv";
import ManualColorScaleList from "../controls/ManualColorScaleList";
import { activeColorPath } from "../state";
import {
  getRGBColorFromPool,
  isValidFloatInput,
  namedColorScales,
} from "../utils";

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

  const state = useMemo(
    () => ({
      useFieldSetting: Boolean(
        setting &&
          ((setting?.name && setting?.name !== "") ||
            (setting?.list && setting?.list.length > 0))
      ),
    }),
    [setting]
  );
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
    state.useFieldSetting
      ? Boolean(
          (setting?.name || setting?.name !== "") &&
            setting?.list &&
            setting?.list.length > 0
        )
        ? "list"
        : "name"
      : null
  );

  const defaultValue = {
    value: 0,
    color: getRGBColorFromPool(colorScheme.colorPool),
  };

  const onBlurName = useCallback(
    (value: string) => {
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
    },
    [colorscaleValues]
  );

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
        const list = copy.sort(
          (a, b) => (a.value as number) - (b.value as number)
        );
        const newSetting = cloneDeep(colorScheme.colorscales ?? []);
        const idx = colorScheme.colorscales?.findIndex(
          (s) => s.path == activePath
        );
        if (idx !== undefined && idx > -1) {
          newSetting[idx].list = list;
          setColorScheme({ ...colorScheme, colorscales: newSetting });
        } else {
          setColorScheme((cur) => ({
            ...cur,
            colorscales: [...newSetting, { path: activePath, list }],
          }));
        }
      }
    },
    [index, setColorScheme, activePath]
  );

  useEffect(() => {
    if (tab === "list") {
      setSetting((prev) => ({
        ...prev,
        name: null,
        list: prev?.list?.length ? prev.list : [defaultValue],
      }));
    }
    if (tab === "name") {
      setSetting((prev) => ({
        ...prev,
        name: prev?.name ?? "viridis",
        list: [],
      }));
    }
  }, [tab]);

  useEffect(() => {
    setInput(colorscaleValues?.name ?? "");
  }, [colorscaleValues.name]);

  return (
    <div>
      <Checkbox
        name={`Use custom colorscale for ${activePath} field`}
        value={state.useFieldSetting}
        setValue={(v: boolean) => {
          if (v) {
            if (tab === "name") {
              setSetting({
                ...colorscaleValues,
                name: "viridis",
                list: null,
              });
            } else {
              setSetting({
                ...colorscaleValues,
                name: null,
                list: [defaultValue],
              });
            }
          } else {
            setSetting(undefined);
          }
        }}
      />
      {state.useFieldSetting && (
        <ControlGroupWrapper>
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
              <Guide>
                Use a named colorscale
                <a
                  href="https://plotly.com/python/colorscales/"
                  target="_blank"
                  rel="noopener"
                  title="what is named colorscale"
                >
                  <InfoOutlinedIcon
                    fontSize="small"
                    style={{ margin: "5", cursor: "pointer" }}
                  />
                </a>
              </Guide>
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
              Define a custom colorscale (range between 0 and 1):
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
        </ControlGroupWrapper>
      )}
    </div>
  );
};

export default Colorscale;

const validateFloat = (n: number) => {
  // 1 and 1.0 should both pass
  return Number.isFinite(n);
};
