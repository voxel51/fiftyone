import React, { useRef } from "react";
import { Box, Paper } from "@mui/material";
import MonacoEditor from "@monaco-editor/react";
import { RecoilRoot } from "recoil";
import { useConsole } from "./state";

export default function Console() {
  const { logs, handleCommand, getAutoCompleteSuggestions } = useConsole();
  const inputEditorRef = useRef(null);

  // Handle command submission
  const handleEditorChange = (value) => {
    if (value && value.endsWith("\n")) {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        handleCommand(trimmedValue);
        setTimeout(() => {
          inputEditorRef.current.setValue("");
        }, 0);
      }
    }
  };

  // Autocomplete handler for editor
  const handleEditorWillMount = (monaco) => {
    monaco.languages.registerCompletionItemProvider("javascript", {
      triggerCharacters: ["."],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const suggestions = getAutoCompleteSuggestions(lineContent);
        return {
          suggestions: suggestions.map((suggestion) => ({
            label: suggestion,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: suggestion,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: model.getWordUntilPosition(position).startColumn,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          })),
        };
      },
    });
  };

  return (
    <RecoilRoot>
      <Box
        sx={{
          p: 2,
          bgcolor: "background.paper",
          height: "80vh",
          overflow: "hidden",
        }}
      >
        <Paper elevation={3} sx={{ p: 2, height: "100%", overflowY: "auto" }}>
          {/* Logs Section */}
          <MonacoEditor
            height="calc(100% - 60px)"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={logs
              .map((log) =>
                log.type === "command"
                  ? `> ${log.text}`
                  : `${log.type === "error" ? "Error: " : ""}${log.text}`
              )
              .join("\n")}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              wrappingIndent: "same",
              automaticLayout: true,
            }}
          />
          {/* Input Section */}
          <MonacoEditor
            height="50px"
            defaultLanguage="javascript"
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              wrappingIndent: "same",
              automaticLayout: true,
            }}
            onMount={(editor) => (inputEditorRef.current = editor)}
            onChange={handleEditorChange}
            beforeMount={handleEditorWillMount}
          />
        </Paper>
      </Box>
    </RecoilRoot>
  );
}
