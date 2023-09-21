import { ColorSchemeInput, subscribe } from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import { useCallback } from "react";
import { DefaultValue, RecoilState, atom, selector } from "recoil";
import { State } from "./recoil";

export const SPACES_DEFAULT = {
  id: "root",
  children: [
    {
      id: "default-samples-node",
      children: [],
      type: "Samples",
      pinned: true,
    },
  ],
  type: "panel-container",
  activeChild: "default-samples-node",
};

export interface Session {
  canEditCustomColors: boolean;
  canEditSavedViews: boolean;
  colorScheme: ColorSchemeInput;
  readOnly: boolean;
  selectedSamples: Set<string>;
  selectedLabels: State.SelectedLabel[];
  sessionSpaces: SpaceNodeJSON;
  selectedFields?: State.Stage;
  sessionGroupSlice?: string;
}

export const SESSION_DEFAULT: Session = {
  canEditCustomColors: true,
  canEditSavedViews: true,
  readOnly: false,
  selectedSamples: new Set(),
  selectedLabels: [],
  sessionSpaces: SPACES_DEFAULT,
  colorScheme: {
    colorPool: [],
    fields: [],
    colorBy: "field",
    colorSeed: 0,
    opacity: 0.7,
    showKeypointSkeleton: true,
    useMultiColorKeypoints: false,
  },
};

type SetterKeys = keyof Omit<
  Session,
  "canEditCustomColors" | "canEditSavedViews" | "readOnly"
>;
type Setter = <K extends SetterKeys>(key: K, value: Session[K]) => void;

type SessionAtomOptions<K extends keyof Session> = {
  key: K;
  default?: Session[K];
};

let sessionRef: Session;
let setterRef: Setter;

type Setters = Partial<{
  [K in SetterKeys]: (value: Session[K]) => void;
}>;
const setters: Setters = {};

export const useSession = (setter: Setter, ref: Session) => {
  setterRef = setter;
  sessionRef = ref;
};

export const useSessionSetter = () => {
  return useCallback(<K extends SetterKeys>(key: K, value: Session[K]) => {
    const setter = setters[key];
    setter && setter(value);
    sessionRef[key] = value;
  }, []);
};

const isTest = typeof process !== "undefined" && process.env.MODE === "test";

export function sessionAtom<K extends keyof Session>(
  options: SessionAtomOptions<K>
) {
  const value = atom<Session[K]>({
    ...options,
    effects: [
      ({ setSelf, trigger }) => {
        const assertValue = () => {
          if (
            sessionRef[options.key] === undefined &&
            options.default === undefined
          ) {
            throw new Error(`A value is required session atom ${options.key}`);
          }
        };
        if (trigger === "get" && !isTest) {
          assertValue();
          setSelf(
            isTest || sessionRef[options.key] === undefined
              ? options.default
              : sessionRef[options.key]
          );
        }

        // @ts-ignore
        setters[options.key] = (value: Session[K]) => {
          setSelf(value);
          if (!isTest) {
            sessionRef[options.key] = value;
          }
        };

        return subscribe((_, { set }) => {
          assertValue();
          set(
            value,
            sessionRef[options.key] === undefined
              ? options.default
              : sessionRef[options.key]
          );
        });
      },
    ],
  });

  return selector<Session[K]>({
    key: `__${options.key}_selector`,
    get: ({ get }) => get(value),
    set: ({ set }, newValue) => {
      if (newValue instanceof DefaultValue) {
        newValue = options.default;
      }

      if (
        options.key === "canEditCustomColors" ||
        options.key === "readOnly" ||
        options.key === "canEditSavedViews" ||
        typeof newValue === "boolean"
      ) {
        throw new Error(`cannot set ${options.key}`);
      }

      if (!isTest) {
        setterRef(options.key, newValue);
        sessionRef[options.key] = newValue;
      }

      set(value, newValue);
    },
  }) as RecoilState<NonNullable<Session[K]>>;
}
