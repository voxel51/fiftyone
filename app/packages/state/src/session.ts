import {
  ColorSchemeInput,
  selectorWithEffect,
  subscribe,
} from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import { useCallback } from "react";
import { DefaultValue, RecoilState, atom, selector } from "recoil";
import { State } from "./recoil";

export const GRID_SPACES_DEFAULT = {
  id: "",
  _cls: "Space",
  component_id: "root",
  children: [
    {
      id: "",
      _cls: "Panel",
      component_id: "default-samples-node",
      pinned: true,
      type: "Samples",
      children: [],
    },
  ],
  active_child: "default-samples-node",
};

export type ModalSelector = {
  groupId?: string;
  id?: string;
  hasNext?: boolean;
  hasPrevious?: boolean;
};

export interface Session {
  canEditCustomColors: { enabled: boolean; message?: string };
  canEditSavedViews: { enabled: boolean; message?: string };
  canEditWorkspaces: { enabled: boolean; message?: string };
  canCreateNewField: { enabled: boolean; message?: string };
  canModifySidebarGroup: { enabled: boolean; message?: string };
  canTagSamplesOrLabels: { enabled: boolean; message?: string };
  colorScheme: ColorSchemeInput;
  fieldVisibilityStage?: State.FieldVisibilityStage;
  filters: State.Filters;
  modalFilters: State.Filters;
  modalSelector?: ModalSelector;
  readOnly: boolean;
  selectedSamples: Set<string>;
  selectedLabels: State.SelectedLabel[];
  sessionSpaces: SpaceNodeJSON;
  sessionGroupSlice?: string;
}

export const SESSION_DEFAULT: Session = {
  canCreateNewField: { enabled: true, message: undefined },
  canEditCustomColors: { enabled: true, message: undefined },
  canEditSavedViews: { enabled: true, message: undefined },
  canEditWorkspaces: { enabled: true, message: undefined },
  canModifySidebarGroup: { enabled: true, message: undefined },
  canTagSamplesOrLabels: { enabled: true, message: undefined },
  colorScheme: {
    colorPool: [],
    colorBy: "field",
    fields: [],
    labelTags: {},
    multicolorKeypoints: false,
    opacity: 0.7,
    showSkeletons: true,
    colorscales: [],
    defaultColorscale: { name: "viridis", list: null },
    defaultMaskTargetsColors: [],
  },
  fieldVisibilityStage: undefined,
  filters: {},
  modalFilters: {},
  readOnly: false,
  selectedSamples: new Set(),
  selectedLabels: [],
  sessionSpaces: GRID_SPACES_DEFAULT,
  sessionGroupSlice: undefined,
};

type SetterKeys = keyof Omit<
  Session,
  | "canCreateNewField"
  | "canEditCustomColors"
  | "canEditSavedViews"
  | "canEditWorkspaces"
  | "canModifySidebarGroup"
  | "canTagSamplesOrLabels"
  | "readOnly"
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

export const useSessionRef = () => {
  return sessionRef;
};

export const getSessionRef = () => {
  return sessionRef;
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
            sessionRef[options.key] === undefined
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

  const transitionKeys = new Set<string>([
    "colorScheme",
    "fieldVisibilityStage",
  ]);
  if (transitionKeys.has(options.key)) {
    return selectorWithEffect<Session[K]>(
      {
        key: `__${options.key}_selector`,
        get: ({ get }) => get(value),
      },
      options.key
    );
  }

  return selector<Session[K]>({
    key: `__${options.key}_selector`,
    get: ({ get }) => get(value),
    set: ({ set }, newValue) => {
      if (newValue instanceof DefaultValue) {
        newValue = options.default;
      }

      if (
        options.key === "canCreateNewField" ||
        options.key === "canEditCustomColors" ||
        options.key === "canEditSavedViews" ||
        options.key === "canEditWorkspaces" ||
        options.key === "canModifySidebarGroup" ||
        options.key === "canTagSamplesOrLabels" ||
        options.key === "readOnly" ||
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
