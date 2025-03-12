import { describe, expect, it } from "vitest";
import { getFileExtension, getFileName, getFileSize, getIcon } from "./util";
import { humanReadableBytes } from "@fiftyone/utilities";
import { Sample } from "../../state";
import codeIcon from "../../icons/code.svg";
import findInPageIcon from "../../icons/findInPage.svg";
import tableViewIcon from "../../icons/tableView.svg";
import terminalIcon from "../../icons/terminal.svg";
import documentIcon from "../../icons/document.svg";

describe("metadata utils", () => {
  describe("getFileExtension", () => {
    it("should return the file extension if it exists", () => {
      expect(getFileExtension("image.png")).toBe("png");
      expect(getFileExtension("image.jpg")).toBe("jpg");
      expect(getFileExtension("data.json")).toBe("json");
    });

    it("should return undefined for invalid inputs", () => {
      expect(getFileExtension("image")).toBeUndefined();
      expect(getFileExtension(null)).toBeUndefined();
      expect(getFileExtension(undefined)).toBeUndefined();
    });
  });

  describe("getFileName", () => {
    it("should return the file name in a path", () => {
      expect(getFileName("/path/to/file")).toBe("file");
      expect(getFileName("/path/to/image.jpg")).toBe("image.jpg");
      expect(getFileName("image.jpg")).toBe("image.jpg");
    });

    it("should return undefined for invalid input", () => {
      expect(getFileName(null)).toBeUndefined();
      expect(getFileName(undefined)).toBeUndefined();
    });
  });

  describe("getFileSize", () => {
    const buildTestConfig = (size: number) => {
      return {
        sample: {
          metadata: {
            size_bytes: size,
          },
        } as unknown as Sample,
        expected: humanReadableBytes(size),
      };
    };

    it("should return a human-readable file size when metadata is available", () => {
      for (const size of [1, 100, 1000, 10000, 100000, 1000000, 10000000]) {
        const config = buildTestConfig(size);
        expect(getFileSize(config.sample)).toBe(config.expected);
      }
    });

    it("should return 'Unknown file size' when metadata is not available", () => {
      expect(getFileSize({} as unknown as Sample)).toBe("Unknown file size");
    });
  });

  describe("getIcon", () => {
    it("should return an icon corresponding to a samples file type", () => {
      expect(getIcon("file.html")).toBe(codeIcon);
      expect(getIcon("file.xhtml")).toBe(codeIcon);
      expect(getIcon("file.xml")).toBe(codeIcon);
      expect(getIcon("file.log")).toBe(findInPageIcon);
      expect(getIcon("file.csv")).toBe(tableViewIcon);
      expect(getIcon("file.py")).toBe(terminalIcon);
    });

    it("should return a fallback value for unknown types", () => {
      expect(getIcon(undefined)).toBe(documentIcon);
      expect(getIcon(null)).toBe(documentIcon);
      expect(getIcon("file.ext")).toBe(documentIcon);
    });
  });
});
