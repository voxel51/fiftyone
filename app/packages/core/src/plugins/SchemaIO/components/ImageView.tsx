import { usePanelEvent } from "@fiftyone/operators";
import { OperatorResult } from "@fiftyone/operators/src/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box, Link } from "@mui/material";
import { getComponentProps, parseSize } from "../utils";
import HeaderView from "./HeaderView";

export default function ImageView(props) {
  const { schema, data } = props;
  const {
    height,
    width,
    alt,
    href,
    operator,
    prompt = false,
    params,
  } = schema?.view || {};
  const imageURI = data ?? schema?.default;

  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  const operatorIsString = typeof operator === "string";
  const hrefIsString = typeof href === "string";
  const isClickable = operatorIsString || hrefIsString;

  const onClick = operatorIsString
    ? () => {
        handleClick(panelId, {
          params,
          operator,
          prompt,
          callback: (result: OperatorResult) => {
            // execution after operator
            if (result?.error) {
              console.error(result?.error);
              console.error(result?.errorMessage);
            }
          },
        });
      }
    : undefined;

  const imageStyles = {
    cursor: isClickable ? "pointer" : "default",
    height: parseSize(height, undefined, "px"),
    width: parseSize(width, undefined, "px"),
  };

  const img = (
    <img
      {...getComponentProps(props, "image", { style: imageStyles })}
      src={imageURI}
      alt={alt}
      onClick={onClick}
    />
  );

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      {hrefIsString ? (
        <Link
          target="_blank"
          rel="noopener noreferrer"
          {...getComponentProps(props, "link")}
          href={href}
        >
          {img}
        </Link>
      ) : (
        img
      )}
    </Box>
  );
}
