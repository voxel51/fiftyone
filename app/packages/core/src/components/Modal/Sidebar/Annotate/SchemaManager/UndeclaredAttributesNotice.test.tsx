import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UndeclaredAttributesNotice from "./UndeclaredAttributesNotice";

configure({ testIdAttribute: "data-cy" });

const mockListUndeclared = vi.fn();
const mockDeclareAttributes = vi.fn();
const mockRefresh = vi.fn();

vi.mock("./useSchemaDocs", () => {
  const api = {
    listUndeclared: (...args: unknown[]) => mockListUndeclared(...args),
    declareAttributes: (...args: unknown[]) => mockDeclareAttributes(...args),
  };
  return { useSchemaDocs: () => api };
});

vi.mock("@fiftyone/state", () => ({
  useRefresh: () => mockRefresh,
}));

const NOTICE = "undeclared-attributes";
const DECLARE = "declare-attributes";

describe("UndeclaredAttributesNotice", () => {
  beforeEach(() => {
    mockListUndeclared.mockReset();
    mockDeclareAttributes.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(cleanup);

  it("renders nothing when every attribute is declared", async () => {
    mockListUndeclared.mockResolvedValue({});
    render(<UndeclaredAttributesNotice schemaId="doc" contentVersion={1} />);

    await waitFor(() => expect(mockListUndeclared).toHaveBeenCalledWith("doc"));
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("lists the undeclared attributes of the dataset default", async () => {
    mockListUndeclared.mockResolvedValue({ gt: ["camera", "brand"] });
    render(<UndeclaredAttributesNotice schemaId={null} contentVersion={1} />);

    await screen.findByTestId(NOTICE);
    expect(mockListUndeclared).toHaveBeenCalledWith(null);
    expect(screen.getByTestId(NOTICE).textContent).toContain(
      "2 attributes aren't declared",
    );
    expect(screen.getByTestId(NOTICE).textContent).toContain(
      "gt: camera, brand",
    );
  });

  it("declares on click and refreshes the dataset", async () => {
    mockListUndeclared.mockResolvedValue({ gt: ["camera"] });
    mockDeclareAttributes.mockResolvedValue({
      declared: ["gt.detections.camera"],
      skipped: {},
    });
    render(<UndeclaredAttributesNotice schemaId="doc" contentVersion={1} />);

    fireEvent.click(await screen.findByTestId(DECLARE));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(mockDeclareAttributes).toHaveBeenCalledWith("doc");
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("explains attributes skipped for mixed types", async () => {
    mockListUndeclared.mockResolvedValue({ gt: ["camera", "brand"] });
    mockDeclareAttributes.mockResolvedValue({
      declared: ["gt.detections.camera"],
      skipped: { gt: ["brand"] },
    });
    render(<UndeclaredAttributesNotice schemaId="doc" contentVersion={1} />);

    fireEvent.click(await screen.findByTestId(DECLARE));

    await waitFor(() =>
      expect(screen.getByTestId(NOTICE).textContent).toContain(
        "1 attribute could not be declared",
      ),
    );
    expect(screen.getByTestId(NOTICE).textContent).toContain("gt: brand");
    expect(screen.queryByTestId(DECLARE)).toBeNull();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("checks again when the schema content changes", async () => {
    mockListUndeclared.mockResolvedValue({});
    const { rerender } = render(
      <UndeclaredAttributesNotice schemaId="doc" contentVersion={1} />,
    );
    await waitFor(() => expect(mockListUndeclared).toHaveBeenCalledTimes(1));

    rerender(<UndeclaredAttributesNotice schemaId="doc" contentVersion={2} />);
    await waitFor(() => expect(mockListUndeclared).toHaveBeenCalledTimes(2));
  });

  it("shows a failed declaration", async () => {
    mockListUndeclared.mockResolvedValue({ gt: ["camera"] });
    mockDeclareAttributes.mockRejectedValue(new Error("forbidden"));
    render(<UndeclaredAttributesNotice schemaId="doc" contentVersion={1} />);

    fireEvent.click(await screen.findByTestId(DECLARE));

    await waitFor(() =>
      expect(screen.getByTestId(NOTICE).textContent).toContain(
        "Failed to declare attributes",
      ),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
