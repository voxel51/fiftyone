import React, { useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import Editor from "@monaco-editor/react";
import * as fos from "@fiftyone/state";

import { ActionOption } from "../Actions/Common";
import { useTheme } from "@fiftyone/components";
import { COLOR_SCHEME } from "../../utils/links";
import { SectionWrapper } from "./ShareStyledDiv";
import { Button } from "../utils";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { validateJSONSetting } from "./utils";

const JSONViewer: React.FC = ({}) => {
  const themeMode = useRecoilValue(fos.theme);
  const theme = useTheme();
  const editorRef = useRef(null);
  const setting = useRecoilValue(fos.sessionColorScheme);
  const { setColorScheme } = fos.useSessionColorScheme();
  const [data, setData] = useState(setting);

  const handleEditorDidMount = (editor) => (editorRef.current = editor);
  const handleEditorChange = (value: string | undefined) => {
    value && setData(JSON.parse(value));
  };

  const onApply = () => {
    if (
      typeof data !== "object" ||
      !data?.colorPool ||
      !Array.isArray(data?.colorPool) ||
      !data?.customizedColorSettings ||
      !Array.isArray(data?.customizedColorSettings) ||
      !data?.customizedColorSettings
    )
      return;
    const { colorPool, customizedColorSettings } = data;
    const validColors = colorPool?.filter((c) => isValidColor(c));
    const validatedSetting = validateJSONSetting(customizedColorSettings);
    setData({
      colorPool: validColors,
      customizedColorSettings: validatedSetting,
    });
    setColorScheme(validColors, validatedSetting, false);
  };

  useEffect(() => {
    setData(setting);
  }, [setting]);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <SectionWrapper>
        You can use the JSON editor to customize the color settings.
        <ActionOption
          href={COLOR_SCHEME}
          text={"Read more"}
          title={"How to set customized color schema?"}
          style={{
            background: "unset",
            color: theme.text.primary,
            paddingTop: 0,
            paddingBottom: 0,
          }}
          svgStyles={{ height: "1rem", marginTop: 7.5 }}
        />
      </SectionWrapper>

      <Editor
        defaultLanguage="json"
        theme={themeMode == "dark" ? "vs-dark" : "vs-light"}
        value={JSON.stringify(data, null, 4)}
        width={"100%"}
        height={"calc(100% - 110px)"}
        wrapperProps={{ padding: 0 }}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
      />
      <div style={{ width: "200px", margin: "0.5rem 1rem" }}>
        <Button
          text="Apply color scheme to session"
          title="Validate color scheme JSON and apply to session color scheme setting"
          onClick={onApply}
        />
      </div>
    </div>
  );
};

export default JSONViewer;
