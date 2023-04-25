import React, { useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import Editor from "@monaco-editor/react";
import * as fos from "@fiftyone/state";

import { tempColorJSON, tempColorSetting, tempGlobalSetting } from "./utils";
import { ActionOption } from "../Actions/Common";
import { useTheme } from "@fiftyone/components";
import { SORT_BY_SIMILARITY } from "../../utils/links";
import { SectionWrapper } from "./ShareStyledDiv";

const JSONViewer: React.FC = ({}) => {
  const themeMode = useRecoilValue(fos.theme);
  const theme = useTheme();
  const editorRef = useRef(null);
  const [global, setGlobal] = useRecoilState(tempGlobalSetting);
  const t = useRecoilValue(fos.sessionColorScheme);
  const fullSetting =
    useRecoilValue(fos.sessionColorScheme).customizedColorSettings ?? [];
  const [data, setData] = useRecoilState(tempColorJSON);
  const resetTempCustomizeColor = useSetRecoilState(tempColorSetting);
  const colors = useRecoilValue(fos.coloring(false)).pool as string[];
  const opacity = useRecoilValue(fos.alpha(false));
  const colorBy = useRecoilValue(
    fos.appConfigOption({ key: "colorBy", modal: false })
  );
  const useMulticolorKeypoints = useRecoilValue(
    fos.appConfigOption({ key: "multicolorKeypoints", modal: false })
  );
  const showSkeleton = useRecoilValue(
    fos.appConfigOption({ key: "showSkeletons", modal: false })
  );

  const handleEditorDidMount = (editor) => (editorRef.current = editor);
  const handleEditorChange = (value: string | undefined) => {
    value && setData(JSON.parse(value));
  };

  useEffect(() => {
    // reset the other temp settings as tab changes, otherwise could cause field setting tab not to show the most updated setting
    resetTempCustomizeColor(null);
    // if globalSetting is not initialized, set global
    if (!global) {
      const setting = {
        colorBy,
        colors,
        opacity,
        useMulticolorKeypoints,
        showSkeleton,
      };
      setGlobal(setting);
    }
    setData({
      colorPool: global?.colors,
      customizedColorSettings: fullSetting,
    });
  }, []);

  if (!global) return null;
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <SectionWrapper>
        You can use the JSON editor to customize the color settings.
        <ActionOption
          href={SORT_BY_SIMILARITY}
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
        height={"calc(100% - 60px)"}
        wrapperProps={{ padding: 0 }}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
      />
    </div>
  );
};

export default JSONViewer;
