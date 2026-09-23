/**
 * @vitest-environment jsdom
 *
 * The 2D geometry form renders through SchemaIO, whose text inputs are
 * UNCONTROLLED: they show `defaultValue` and only pick up a new one when
 * `useKey` hands them a new key, which it stops doing once the user has typed
 * in that path. These pin that a commit from anywhere else — a drag, an undo,
 * a playhead move — still reaches the form, while the user's own typing is
 * left alone.
 *
 * SchemaIO's renderer is stood in for below: the real one needs the whole RJSF
 * registry, and what matters here is its key contract, which the stand-in
 * reproduces through the real `useKey`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUseKeyStores,
  useKey,
} from "../../../../../plugins/SchemaIO/hooks";

const SAMPLE = "sample-1";
const PATH = "detections";
const INSTANCE = "instance-1";

/** The engine's stored label; mutating it stands for a commit. */
let stored: { bounding_box: number[]; rotation?: number };

const updateLabel = vi.fn((_ref: unknown, data: Record<string, unknown>) => {
  stored = { ...stored, ...data };
});

const dispatch = vi.fn();

vi.mock("@fiftyone/annotation", () => ({
  GEOMETRY_SIGNAL: "geometry",
  encodeEntityId: (dataset: string, ref: { instanceId: string }) =>
    `${dataset}:${ref.instanceId}`,
  useActiveAnnotationSampleId: () => SAMPLE,
  useAnnotationEngine: () => ({
    getLabel: () => stored,
    updateLabel,
    mintGestureId: () => "gesture-1",
    transaction: (fn: () => unknown) => fn(),
  }),
  useAnnotationEventBus: () => ({ dispatch }),
  useEngineSelector: (engine: unknown, selector: (e: unknown) => unknown) =>
    selector(engine),
  useSignalValue: () => null,
}));

vi.mock("@fiftyone/state", () => ({ useCurrentDatasetId: () => "dataset-1" }));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => ({
    selected: {
      ref: { sample: SAMPLE, path: PATH, instanceId: INSTANCE },
      overlay: { id: INSTANCE, field: PATH },
    },
  }),
}));

type Coordinates = {
  position: { x?: number; y?: number };
  dimensions: { width?: number; height?: number };
  rotation: { rotation?: number };
};

/** One uncontrolled input, keyed exactly as `TextFieldView` keys its own. */
const Field = ({
  path,
  value,
  onCommit,
}: {
  path: string;
  value?: number;
  onCommit: (next: number) => void;
}) => {
  const [key, setUserChanged] = useKey(path, {}, value, true);

  return (
    <input
      key={key}
      aria-label={path}
      defaultValue={value}
      onChange={(e) => {
        setUserChanged();
        onCommit(Number(e.target.value));
      }}
    />
  );
};

vi.mock("../../../../../plugins/SchemaIO", () => ({
  SchemaIOComponent: ({
    data,
    onChange,
  }: {
    data: Coordinates;
    onChange: (next: Coordinates) => void;
  }) => (
    <>
      <Field
        path="position.x"
        value={data.position.x}
        onCommit={(x) =>
          onChange({ ...data, position: { ...data.position, x } })
        }
      />
      <Field
        path="dimensions.width"
        value={data.dimensions.width}
        onCommit={(width) =>
          onChange({ ...data, dimensions: { ...data.dimensions, width } })
        }
      />
      <Field
        path="rotation.rotation"
        value={data.rotation.rotation}
        onCommit={(rotation) => onChange({ ...data, rotation: { rotation } })}
      />
    </>
  ),
}));

import Position from "./Position";

const field = (path: string) => screen.getByLabelText(path) as HTMLInputElement;

beforeEach(() => {
  stored = { bounding_box: [0.4, 0.4, 0.2, 0.2], rotation: 0.5 };
  clearUseKeyStores();
  updateLabel.mockClear();
  dispatch.mockClear();
});

afterEach(cleanup);

describe("Position", () => {
  it("shows the geometry the engine holds", () => {
    render(<Position />);

    expect(field("position.x").value).toBe("0.4");
    expect(field("dimensions.width").value).toBe("0.2");
    expect(field("rotation.rotation").value).toBe("0.5");
  });

  it("commits a typed value to the engine", async () => {
    const user = userEvent.setup();
    render(<Position />);

    await user.clear(field("rotation.rotation"));
    await user.type(field("rotation.rotation"), "1.25");

    expect(stored.rotation).toBe(1.25);
  });

  it("announces the commit so a video surface can promote the keyframe", async () => {
    const user = userEvent.setup();
    render(<Position />);

    await user.clear(field("rotation.rotation"));
    await user.type(field("rotation.rotation"), "1");

    expect(dispatch).toHaveBeenLastCalledWith(
      "annotation:formGeometryCommitted",
      { instanceId: INSTANCE, path: PATH, undoKey: "gesture-1" },
    );
  });

  it("re-syncs a typed field when the engine commits from elsewhere", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Position />);

    await user.clear(field("rotation.rotation"));
    await user.type(field("rotation.rotation"), "1.25");
    expect(field("rotation.rotation").value).toBe("1.25");

    // a drag / undo / playhead move commits geometry this form did not write
    stored = { bounding_box: [0.1, 0.1, 0.3, 0.3], rotation: 0.75 };
    rerender(<Position />);

    expect(field("rotation.rotation").value).toBe("0.75");
    expect(field("position.x").value).toBe("0.1");
    expect(field("dimensions.width").value).toBe("0.3");
  });

  it("leaves a typed field alone when the commit is the form's own edit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Position />);

    await user.clear(field("rotation.rotation"));
    await user.type(field("rotation.rotation"), "1.25");

    // the engine echoes exactly what the form just wrote
    rerender(<Position />);

    expect(field("rotation.rotation").value).toBe("1.25");
  });
});
