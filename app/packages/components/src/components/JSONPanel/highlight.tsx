import { DataItemProps, defineEasyType } from "@textea/json-viewer";
import React, { useMemo } from "react";

const HighlightedText = ({
  text,
  searchTerm,
}: {
  text: string | number;
  searchTerm: string;
}) => {
  const parts = useMemo(
    () => String(text ?? "").split(searchTerm),
    [text, searchTerm]
  );

  if (!String(text).includes(searchTerm)) {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {part}
          {index !== parts.length - 1 && (
            <span style={{ backgroundColor: "yellow", color: "black" }}>
              {searchTerm}
            </span>
          )}
        </React.Fragment>
      ))}
    </>
  );
};

export const KeyRenderer = (props: DataItemProps & { searchTerm: string }) => {
  const { searchTerm, path } = props;
  const leafPath = String(path.at(-1));

  if (leafPath?.includes(searchTerm)) {
    return <HighlightedText text={leafPath} searchTerm={searchTerm} />;
  }

  return <>{leafPath}</>;
};

export const KeyRendererWrapper = (searchTerm: string) => {
  const wrapper = (props: DataItemProps) => {
    return <KeyRenderer searchTerm={searchTerm} {...props} />;
  };

  // show all keys (required in runtime by json-viewer)
  wrapper.when = () => true;
  return wrapper;
};

const getHighlightedComponentString = (searchTerm: string) =>
  defineEasyType({
    is: (value) => {
      if (searchTerm?.length === 0 || typeof value !== "string") {
        return false;
      }

      return String(value).includes(searchTerm);
    },
    type: "string",
    colorKey: "base09",
    Renderer: (props) => {
      const value = props.value as string;
      return <HighlightedText text={`"${value}"`} searchTerm={searchTerm} />;
    },
  });

const isInt = (n: number) => n % 1 === 0;

const getHighlightedComponentFloat = (searchTerm: string) =>
  defineEasyType({
    is: (value) => {
      if (
        searchTerm?.length === 0 ||
        typeof value !== "number" ||
        isInt(value) ||
        isNaN(value)
      ) {
        return false;
      }

      return String(value).includes(searchTerm);
    },
    type: "float",
    colorKey: "base0B",
    Renderer: (props) => {
      const value = props.value as number;
      return <HighlightedText text={value} searchTerm={searchTerm} />;
    },
  });

const getHighlightedComponentInt = (searchTerm: string) =>
  defineEasyType({
    is: (value) => {
      if (
        searchTerm?.length === 0 ||
        typeof value !== "number" ||
        isNaN(value) ||
        !isInt(value)
      ) {
        return false;
      }

      return String(value).includes(searchTerm);
    },
    type: "int",
    colorKey: "base0F",
    Renderer: (props) => {
      const value = props.value as number;
      return <HighlightedText text={value} searchTerm={searchTerm} />;
    },
  });

export const getValueRenderersForSearch = (searchTerm: string) => [
  getHighlightedComponentString(searchTerm),
  getHighlightedComponentFloat(searchTerm),
  getHighlightedComponentInt(searchTerm),
];
