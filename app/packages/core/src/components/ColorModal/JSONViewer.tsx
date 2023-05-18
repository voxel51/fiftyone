import { useTheme } from "@fiftyone/components";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import * as fos from "@fiftyone/state";
import Editor from "@monaco-editor/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { COLOR_SCHEME } from "../../utils/links";
import { ActionOption } from "../Actions/Common";
import { Button } from "../utils";
import { SectionWrapper } from "./ShareStyledDiv";
import { validateJSONSetting } from "./utils";

const JSONViewer: React.FC = () => {
  const themeMode = useRecoilValue(fos.theme);
  const theme = useTheme();
  const editorRef = useRef(null);
  const sessionColor = useRecoilValue(fos.sessionColorScheme);

  const setting = useMemo(() => {
    return {
      colorPool: sessionColor?.colorPool ?? [],
      fields: validateJSONSetting(sessionColor?.fields ?? []),
    };
  }, [sessionColor]);
  const setColorScheme = fos.useSetSessionColorScheme();
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
      !data?.fields ||
      !Array.isArray(data?.fields) ||
      !data?.fields
    )
      return;
    const { colorPool, fields } = data;
    const validColors = colorPool?.filter((c) => isValidColor(c));
    const validatedSetting = validateJSONSetting(fields);
    setData({
      colorPool: validColors,
      fields: validatedSetting,
    });
    setColorScheme(false, {
      colorPool: validColors,
      fields: validatedSetting,
    });
  };

  useEffect(() => {
    setData(setting);
  }, [setting]);

  const haveChanges = JSON.stringify(setting) !== JSON.stringify(data);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <SectionWrapper>
        <p style={{ margin: 0 }}>
          You can use the JSON editor below to copy/edit your current color
          scheme, or you can paste in a pre-built color scheme to apply.
        </p>
        <ActionOption
          href={COLOR_SCHEME}
          text={"Read more"}
          title={"How to set customized color schema?"}
          style={{
            background: "unset",
            color: theme.text.primary,
            paddingTop: 0,
            paddingBottom: 0,
            display: "inline-block",
          }}
          svgStyles={{ height: "1rem", marginTop: 2 }}
        />{" "}
        about custom color schemes.
      </SectionWrapper>
      <Editor
        defaultLanguage="json"
        theme={themeMode == "dark" ? "vs-dark" : "vs-light"}
        value={JSON.stringify(data, null, 4)}
        width={"100%"}
        height={"calc(100% - 90px)"}
        wrapperProps={{ padding: 0 }}
        onMount={handleEditorDidMount}
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
