import {
  ColorSchemeInput,
  selectorWithEffect,
  subscribe,
} from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import { useCallback } from "react";
import { useStore } from "jotai";
import {
  atom,
  AtomOptions,
  DefaultValue,
  ReverbState,
  selector,
} from "@fiftyone/reverb";
import { State } from "./atoms";
import {
  DEFAULT_LABEL_SELECTION_STYLE,
  DEFAULT_SELECTION_STYLE,
  type LabelSelectionStyle,
  type SelectionStyle,
  type SelectionType,
} from "./atoms/types";

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

/**
 * Read-only session properties that cannot be set externally via useSessionSetter().
 * These are set only during session initialization in useLocalSession.
 */
const READONLY_SESSION_DEFAULTS = {
  canAnnotate: { enabled: true, message: undefined as string | undefined },
  canCreateNewField: {
    enabled: true,
    message: undefined as string | undefined,
  },
  canEditCustomColors: {
    enabled: true,
    message: undefined as string | undefined,
  },
  canEditLabels: {
    enabled: true,
    message: undefined as string | undefined,
  },
  canEditSavedViews: {
    enabled: true,
    message: undefined as string | undefined,
  },
  canEditWorkspaces: {
    enabled: true,
    message: undefined as string | undefined,
  },
  canManageSchema: { enabled: true, message: undefined as string | undefined },
  canModifySidebarGroup: {
    enabled: true,
    message: undefined as string | undefined,
  },
  canTagSamplesOrLabels: {
    enabled: true,
    message: undefined as string | undefined,
  },
  readOnly: false, // snapshots
};

type ReadOnlySessionKey = keyof typeof READONLY_SESSION_DEFAULTS;

export interface Session {
  canAnnotate: { enabled: boolean; message?: string };
  canEditCustomColors: { enabled: boolean; message?: string };
  canEditSavedViews: { enabled: boolean; message?: string };
  canEditWorkspaces: { enabled: boolean; message?: string };
  canCreateNewField: { enabled: boolean; message?: string };
  canManageSchema: { enabled: boolean; message?: string };
  canModifySidebarGroup: { enabled: boolean; message?: string };
  canTagSamplesOrLabels: { enabled: boolean; message?: string };
  canEditLabels: { enabled: boolean; message?: string };
  colorScheme: ColorSchemeInput;
  fieldVisibilityStage?: State.FieldVisibilityStage;
  filters: State.Filters;
  modalFilters: State.Filters;
  modalSelector?: ModalSelector;
  readOnly: boolean;
  selectedSamples: Map<string, SelectionType>;
  selectedLabels: State.SelectedLabel[];
  sampleSelectionStyle: SelectionStyle;
  labelSelectionStyle: LabelSelectionStyle;
  sessionSpaces: SpaceNodeJSON;
  sessionGroupSlice?: string;
}

export const SESSION_DEFAULT: Session = {
  ...READONLY_SESSION_DEFAULTS,
  colorScheme: {
    colorPool: [],
    colorBy: "field",
    fields: [],
    labelTags: {},
    temporalTags: {},
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
  selectedSamples: new Map(),
  selectedLabels: [],
  sampleSelectionStyle: DEFAULT_SELECTION_STYLE,
  labelSelectionStyle: DEFAULT_LABEL_SELECTION_STYLE,
  sessionSpaces: GRID_SPACES_DEFAULT,
  sessionGroupSlice: undefined,
};

type SetterKeys = keyof Omit<Session, ReadOnlySessionKey>;
type Setter = <K extends SetterKeys>(key: K, value: Session[K]) => void;

type SessionAtomOptions<K extends keyof Session> = {
  key: K;
  default?: Session[K];
  effects?: AtomOptions<Session[K]>["effects"];
};

type SessionWriter = <T>(state: ReverbState<T>, value: T) => void;

let sessionRef: Session;
let setterRef: Setter;

/**
 * Registered when each atom is defined. An effect cannot populate this: it
 * runs on subscription, so a write before anything mounts would reach the
 * session object and never the store.
 */
const registered: Partial<{
  [K in keyof Session]: {
    state: ReverbState<Session[K]>;
    fallback: Session[K];
  };
}> = {};

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
  const store = useStore();

  return useCallback(
    <K extends SetterKeys>(key: K, value: Session[K]) => {
      const entry = registered[key];
      const resolved = value === undefined && entry ? entry.fallback : value;

      if (!isTest) {
        sessionRef[key] = resolved;
      }

      if (entry) {
        store.set(entry.state, resolved);
      }
    },
    [store],
  );
};

const isTest = typeof process !== "undefined" && process.env.MODE === "test";

/**
 * Syncs every session atom from the session object on each published page.
 * Registered here rather than per atom: an atom's effect only runs once
 * something subscribes, and on a reload the server's state can arrive first,
 * leaving the atom holding whatever its first read resolved.
 */
/**
 * Writes every session atom from the session object. A first read can only
 * seed from whatever the session held at that moment, and on a reload the
 * page is loaded rather than published — so nothing else would run.
 */
export const syncSessionState = (write: SessionWriter) => {
  if (isTest) {
    return;
  }

  for (const key of Object.keys(registered) as (keyof Session)[]) {
    const entry = registered[key];

    if (!entry) {
      continue;
    }

    const value = sessionRef?.[key];

    write(entry.state, value === undefined ? entry.fallback : value);
  }
};

subscribe((_, { set }) => syncSessionState(set));

export function sessionAtom<K extends keyof Session>(
  options: SessionAtomOptions<K>,
) {
  const value = atom<Session[K]>({
    key: options.key,
    default: options.default as Session[K],
    /**
     * The effect below seeds this from the session, but it cannot run before
     * the first read returns, so a read takes the session value itself.
     */
    resolve: () =>
      isTest || sessionRef?.[options.key] === undefined
        ? options.default
        : sessionRef[options.key],
    effects: [
      ...(options.effects || []),
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
              : sessionRef[options.key],
          );
        }

        return undefined;
      },
    ],
  });

  (registered as Record<string, unknown>)[options.key] = {
    state: value,
    fallback: options.default,
  };

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
      options.key,
    );
  }

  return selector<Session[K]>({
    key: `__${options.key}_selector`,
    get: ({ get }) => get(value),
    set: ({ set }, incoming) => {
      // a reset arrives as the sentinel and means this key's default
      const newValue = (
        incoming instanceof DefaultValue ? options.default : incoming
      ) as Session[K];

      if (
        options.key in READONLY_SESSION_DEFAULTS ||
        typeof newValue === "boolean"
      ) {
        throw new Error(`cannot set ${options.key}`);
      }

      if (!isTest) {
        if (setterRef) {
          setterRef(options.key as SetterKeys, newValue as Session[SetterKeys]);
        }
        if (sessionRef) {
          sessionRef[options.key] = newValue;
        }
      }

      set(value, newValue);
    },
  }) as ReverbState<NonNullable<Session[K]>>;
}
