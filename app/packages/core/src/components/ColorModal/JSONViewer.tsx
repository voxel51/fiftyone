import React, { useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import Editor from "@monaco-editor/react";
import * as fos from "@fiftyone/state";

import {
  SectionWrapper,
  tempColorJSON,
  tempColorSetting,
  tempGlobalSetting,
} from "./utils";
import { customizeColorSettings } from "@fiftyone/state";
import { ActionOption } from "../Actions/Common";
import { useTheme } from "@fiftyone/components";
import { SORT_BY_SIMILARITY } from "../../utils/links";

const JSONViewer: React.FC = ({}) => {
  const themeMode = useRecoilValue(fos.theme);
  const theme = useTheme();
  const editorRef = useRef(null);
  const global = useRecoilValue(tempGlobalSetting);
  const fullSetting = useRecoilValue(customizeColorSettings);
  const [data, setData] = useRecoilState(tempColorJSON);
  const resetTempCustomizeColor = useSetRecoilState(tempColorSetting);

  const handleEditorDidMount = (editor) => (editorRef.current = editor);
  const handleEditorChange = (value: string | undefined) => {
    value && setData(JSON.parse(value));
  };

  useEffect(() => {
    // reset the other temp settings as tab changes, otherwise could cause field setting tab not to show the most updated setting
    resetTempCustomizeColor(null);
    setData({
      colorScheme: global?.colors,
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
