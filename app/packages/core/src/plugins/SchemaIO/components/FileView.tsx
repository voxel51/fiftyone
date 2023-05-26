import { Box } from "@mui/material";
import React, { useState } from "react";
import FileDrop from "./FileDrop";
import HeaderView from "./HeaderView";
import TabsView from "./TabsView";
import TextFieldView from "./TextFieldView";
import { getComponentProps } from "../utils";

export default function FileView(props) {
  const { onChange, path, schema, autoFocused } = props;
  const { view = {} } = schema;
  const { types } = view;
  const [type, setType] = useState("file");

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <TabsView
        schema={{
          view: {
            choices: [
              { value: "file", label: "Upload" },
              { value: "url", label: "URL" },
            ],
          },
        }}
        onChange={(path, value) => {
          setType(value);
          onChange(path, "");
        }}
        {...getComponentProps(props, "tabs")}
      />
      <Box sx={{ pt: 1 }} {...getComponentProps(props, "fileContainer")}>
        {type === "file" && (
          <FileDrop
            onChange={async (files) => {
              if (files?.length === 0) return onChange(path, "");
              const [file] = files;
              const { error, result } = await fileToBase64(file);
              if (error) return; // todo: handle error
              onChange(path, result);
            }}
            types={types}
            autoFocused={autoFocused}
            // allowMultiple={allowMultiple}
            {...getComponentProps(props, "fileDrop")}
          />
        )}
        {type === "url" && (
          <TextFieldView
            schema={{ view: { placeholder: "URL to a file" } }}
            onChange={onChange}
            {...getComponentProps(props, "fileURL")}
          />
        )}
      </Box>
    </Box>
  );
}

function fileToBase64(
  file: File
): Promise<{ result?: string; error?: ProgressEvent<EventTarget> }> {
  return new Promise((resolve) => {
    const fileReader = new FileReader();
    fileReader.readAsDataURL(file);
    fileReader.onload = () => resolve({ result: fileReader.result as string });
    fileReader.onerror = (error) => resolve({ error });
  });
}
