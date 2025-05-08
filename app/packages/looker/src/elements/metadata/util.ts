import codeIcon from "../../icons/code.svg";
import documentIcon from "../../icons/document.svg";
import findInPageIcon from "../../icons/findInPage.svg";
import tableViewIcon from "../../icons/tableView.svg";
import terminalIcon from "../../icons/terminal.svg";
import { humanReadableBytes } from "@fiftyone/utilities";
import { Sample } from "../../state";

const defaultIcon = documentIcon;
const iconMapping: { [extension: string]: string } = {
  html: codeIcon,
  xml: codeIcon,
  xhtml: codeIcon,
  log: findInPageIcon,
  csv: tableViewIcon,
  py: terminalIcon,
};

export const getFileExtension = (path?: string): string | undefined => {
  if (path?.includes(".")) {
    return path.split(".").slice(-1)[0];
  } else {
    return undefined;
  }
};

export const getIcon = (path: string): string => {
  const extension = getFileExtension(path);

  // icon may be a path or an object like {src: path} depending on the
  // environment.
  let icon: string | { src: string };
  if (!extension || !iconMapping[extension]) {
    icon = defaultIcon;
  } else {
    icon = iconMapping[extension];
  }

  return (icon as any as { src: string }).src ?? icon;
};

export const getFileName = (path?: string): string | undefined => {
  // Split by "/" or "\" and return the last element
  return path?.split(/[/\\]/).pop();
};

export const getFileSize = (sample: Sample): string => {
  if (sample.metadata?.size_bytes) {
    return humanReadableBytes(sample.metadata.size_bytes);
  } else {
    return "Unknown file size";
  }
};
