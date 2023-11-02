import { useTheme } from "@fiftyone/components";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { ColorSchemeInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import Editor from "@monaco-editor/react";
import { Link } from "@mui/material";
import colorString from "color-string";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { COLOR_SCHEME } from "../../utils/links";
import { Button } from "../utils";
import { SectionWrapper } from "./ShareStyledDiv";
import {
  validateJSONSetting,
  validateLabelTags,
  validateMaskColor,
} from "./utils";

const JSONViewer: React.FC = () => {
  const themeMode = useRecoilValue(fos.theme);
  const theme = useTheme();
  const colorScheme = useRecoilValue(fos.colorScheme);
  const ref = useRef<HTMLDivElement>(null);

  const setting = useMemo(() => {
    return {
      colorPool: colorScheme?.colorPool ?? [],
      colorBy: colorScheme?.colorBy ?? "field",
      opacity: colorScheme?.opacity ?? fos.DEFAULT_ALPHA,
      multicolorKeypoints: Boolean(colorScheme?.multicolorKeypoints),
      showSkeletons: colorScheme?.showSkeletons,
      fields: validateJSONSetting(colorScheme.fields ?? []),
      labelTags: validateLabelTags(colorScheme?.labelTags ?? {}),
      defaultMaskTargetsColors: validateMaskColor(
        colorScheme.defaultMaskTargetsColors
      ),
    };
  }, [colorScheme]);

  const setColorScheme = fos.useSetSessionColorScheme();
  const [data, setData] = useState(setting);

  const handleEditorChange = (value: string | undefined) => {
    value && setData(JSON.parse(value));
    // dispatch a custom event for e2e test to capture
    if (ref?.current) {
      ref.current.dispatchEvent(
        new CustomEvent("json-viewer-update", {
          bubbles: true,
        })
      );
    }
  };

  const onApply = () => {
    if (
      typeof data !== "object" ||
      !data?.colorPool ||
      !Array.isArray(data?.colorPool) ||
      !data?.fields ||
      !Array.isArray(data?.fields) ||
      !data?.fields
    )
      return;
    const { colorPool, fields } = data;
    const validColors = colorPool
      ?.filter((c) => isValidColor(c))
      .map((c) => colorString.to.hex(colorString.get(c)!.value));
    const validatedSetting = validateJSONSetting(
      fields as ColorSchemeInput["fields"]
    );
    const validatedColorBy = ["field", "label"].includes(data?.colorBy)
      ? data?.colorBy
      : colorScheme.colorBy ?? "field";
    const validatedOpacity =
      typeof data?.opacity === "number" &&
      data.opacity <= 1 &&
      data.opacity >= 0
        ? data?.opacity
        : colorScheme.opacity ?? fos.DEFAULT_ALPHA;
    const validatedMulticolorKeypoints =
      typeof data?.multicolorKeypoints === "boolean"
        ? data?.multicolorKeypoints
        : colorScheme?.multicolorKeypoints ?? false;
    const validatedShowSkeletons = Boolean(
      typeof data?.showSkeletons === "boolean"
        ? data?.showSkeletons
        : colorScheme?.showSkeletons
    );
    const validatedLabelTags = {
      fieldColor: isValidColor(data?.labelTags?.fieldColor)
        ? colorString.to.hex(
            colorString.get(data?.labelTags?.fieldColor as string)!.value
          )
        : undefined,
      valueColors: data?.labelTags?.valueColors
        ?.filter((pair) => isValidColor(pair.color))
        .map((pair) => ({
          color: colorString.to.hex(colorString.get(pair.color)!.value),
          value: pair.value,
        })),
    };

    const validatedDefaultMaskTargetsColors = validateMaskColor(
      data.defaultMaskTargetsColors
    );

    setData({
      colorPool: validColors,
      fields: validatedSetting,
      labelTags: validatedLabelTags,
      colorBy: validatedColorBy,
      multicolorKeypoints: validatedMulticolorKeypoints,
      opacity: validatedOpacity,
      showSkeletons: validatedShowSkeletons,
      defaultMaskTargetsColors: validatedDefaultMaskTargetsColors,
    });

    setColorScheme({
      colorPool: validColors,
      colorBy: validatedColorBy,
      fields: validatedSetting,
      labelTags: validatedLabelTags,
      multicolorKeypoints: validatedMulticolorKeypoints,
      opacity: validatedOpacity,
      showSkeletons: validatedShowSkeletons,
      defaultMaskTargetsColors: validatedDefaultMaskTargetsColors,
    });
  };

  useLayoutEffect(() => {
    setData(setting);
    if (ref?.current) {
      ref?.current.dispatchEvent(
        new CustomEvent("json-viewer-update", {
          bubbles: true,
        })
      );
    }
  }, [setting, ref]);

  const haveChanges = JSON.stringify(setting) !== JSON.stringify(data);

  return (
    <div
      data-cy="color-scheme-editor"
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
      ref={ref}
    >
      <SectionWrapper>
        <p style={{ margin: 0, lineHeight: "1.3rem" }}>
          You can use the JSON editor below to copy/edit your current color
          scheme, or you can paste in a pre-built color scheme to apply.{" "}
          <Link style={{ color: theme.text.primary }} href={COLOR_SCHEME}>
            Learn more
          </Link>{" "}
          about custom color schemes.
        </p>
      </SectionWrapper>
      <Editor
        defaultLanguage="json"
        theme={themeMode == "dark" ? "vs-dark" : "vs-light"}
        value={JSON.stringify(data, null, 4)}
        width={"100%"}
        height={"calc(100% - 90px)"}
        wrapperProps={{ padding: 0 }}
        onChange={handleEditorChange}
      />
      {haveChanges && (
        <Button
          onClick={onApply}
          style={{
            margin: "0.25rem",
            backgroundColor: theme.primary.main,
            color: "#fff",
            position: "absolute",
            top: "calc(100% - 90px)",
            left: "calc(100% - 150px)",
            textAlign: "center",
          }}
          text="Apply Changes"
          title="Validate color scheme JSON and apply to session color scheme setting"
        />
      )}
    </div>
  );
};

export default JSONViewer;
