import { useCurrentDatasetPermission } from "@fiftyone/hooks";
import { type datasetQuery, subscribeBefore } from "@fiftyone/relay";
import type { SpaceNodeJSON } from "@fiftyone/spaces";
import {
  type ModalSelector,
  SESSION_DEFAULT,
  SPACES_DEFAULT,
  type Session,
  type State,
  ensureColorScheme,
  useSession,
} from "@fiftyone/state";
import {
  CHANGE_CUSTOM_COLOR,
  CHANGE_SAVED_VIEWS,
  CHANGE_WORKSPACES,
  CREATE_NEW_FIELD,
  MODIFY_SIDEBAR_GROUP,
  TAG_SAMPLE,
  showReadonlyDatasetIndicator,
} from "@fiftyone/teams-state";
import { toSlug } from "@fiftyone/utilities";
import { useEffect, useMemo } from "react";
import { useSetRecoilState } from "recoil";
import {
  MODAL_EVENT,
  getHistoryState,
  pushHistoryState,
  replaceHistoryState,
} from "./state";

type PermissionType =
  | "canEditCustomColors"
  | "canEditSavedViews"
  | "canEditWorkspaces"
  | "canTagSamplesOrLabels"
  | "canCreateNewField"
  | "canModifySidebarGroup";

export type TeamsSession = Omit<
  Session,
  PermissionType | "readOnly" | "colorScheme"
> & {
  colorScheme: Session["colorScheme"] | null;
  datasetIdentifier: string;
  filters: State.Filters;
  snapshot?: string;
  view?: string | State.Stage[];
};

export type TeamsSessionState = Omit<TeamsSession, "datasetIdentifier">;

export const TEAMS_SESSION_DEFAULT = {
  colorScheme: null,
  filters: {},
  modalFilters: {},
  selectedLabels: [],
  selectedSamples: new Set<string>(),
  sessionSpaces: SPACES_DEFAULT,
  view: [],
};

export const resetSession = (datasetIdentifier: string) => {
  teamsSessionRef = {
    datasetIdentifier,
    ...TEAMS_SESSION_DEFAULT,
  };
  sessionStorage.removeItem(datasetIdentifier);
};

const permissionMessages = {
  canEditCustomColors: {
    noPermission:
      "You do not have permission to modify dataset's custom colors.",
    readOnly: "Cannot modify custom colors in read-only mode.",
  },
  canEditSavedViews: {
    noPermission: "You do not have permission to modify dataset's saved views.",
    readOnly: "Cannot modify saved views in read-only mode.",
  },
  canEditWorkspaces: {
    noPermission: "You do not have permission to modify dataset's workspaces.",
    readOnly: "Cannot modify workspaces in read-only mode.",
  },
  canTagSamplesOrLabels: {
    noPermission: "You do not have permission to tag samples or labels.",
    readOnly: "Cannot tag samples or labels in read-only mode.",
  },
  canCreateNewField: {
    noPermission: "You do not have permission to create new fields.",
    readOnly: "Cannot create new fields in read-only mode.",
  },
  canModifySidebarGroup: {
    noPermission: "You do not have permission to modify sidebar group.",
    readOnly: "Cannot modify sidebar group in read-only mode.",
  },
};

const getSessionPermissions = (datasetPermission, isReadonly, type) => {
  const { noPermission, readOnly } = permissionMessages[type];
  const enabled = datasetPermission && !isReadonly;
  const message = [];

  if (!datasetPermission) message.push(noPermission);
  else if (isReadonly) message.push(readOnly);

  return { enabled, message: enabled ? undefined : message.join(" ") };
};

export const useLocalSession = (datasetIdentifier, snapshot) => {
  // minimum permission before true read-only permission which is VIEW
  const canTag = useCurrentDatasetPermission([TAG_SAMPLE]);
  const isReadonly = useMemo(
    () => Boolean(snapshot) || !Boolean(canTag),
    [snapshot, canTag]
  );

  const permissionTypes = [
    "canEditSavedViews",
    "canEditWorkspaces",
    "canEditCustomColors",
    "canTagSamplesOrLabels",
    "canCreateNewField",
    "canModifySidebarGroup",
  ];

  const actions = {
    canEditSavedViews: CHANGE_SAVED_VIEWS,
    canEditWorkspaces: CHANGE_WORKSPACES,
    canEditCustomColors: CHANGE_CUSTOM_COLOR,
    canTagSamplesOrLabels: TAG_SAMPLE,
    canCreateNewField: CREATE_NEW_FIELD,
    canModifySidebarGroup: MODIFY_SIDEBAR_GROUP,
  };

  const sessionPermissions = permissionTypes.reduce((acc, type) => {
    acc[type] = getSessionPermissions(
      useCurrentDatasetPermission([actions[type]]),
      isReadonly,
      type
    );
    return acc;
  }, {});

  // initialize session permissions values
  Object.assign(sessionRef, sessionPermissions, { readOnly: isReadonly });

  // update readOnly if snapshot value changes before a page transition
  useEffect(
    () =>
      subscribeBefore<datasetQuery>(({ data }) => {
        const state = getHistoryState();

        sessionRef.colorScheme = ensureColorScheme(
          sessionRef.colorScheme ?? data.dataset?.appConfig?.colorScheme,
          data.config
        );
        sessionRef.readOnly =
          Boolean(state.snapshot) ||
          !sessionPermissions.canTagSamplesOrLabels.enabled;

        sessionRef.fieldVisibilityStage = state.fieldVisibilityStage;
      }),
    [isReadonly, sessionPermissions]
  );

  const setShowReadonlyDatasetIndicator = useSetRecoilState(
    showReadonlyDatasetIndicator
  );
  useEffect(() => {
    setShowReadonlyDatasetIndicator(isReadonly);
    return () => {
      setShowReadonlyDatasetIndicator(false);
    };
  }, [isReadonly, setShowReadonlyDatasetIndicator]);

  // callback run when session atom value is set through recoil
  // we write to browser session storage here
  useSession((key, value) => {
    sessionRef[key] = value;

    if (key === "sessionSpaces") {
      replaceHistoryState((state) => {
        const name = (value as SpaceNodeJSON)._name;
        return {
          ...state,
          workspaceSlug: name ? toSlug(name) : name,
        };
      });
    }

    if (key === "modalSelector") {
      const modalSelector = value as ModalSelector;
      pushHistoryState((state) => ({
        ...state,
        event: MODAL_EVENT,
        modalSelector,
      }));
    }

    if (key === "sessionGroupSlice") {
      replaceHistoryState((state) => {
        return { ...state, slice: value as string };
      });
    }

    writeSession(datasetIdentifier, async (current) => {
      current[key] = value;
    });
  }, sessionRef);
};

const SESSION_KEYS = new Set<
  | "colorScheme"
  | "fieldVisibilityStage"
  | "modalSelector"
  | "selectedLabels"
  | "selectedSamples"
  | "sessionGroupSlice"
  | "sessionSpaces"
>([
  "colorScheme",
  "fieldVisibilityStage",
  "modalSelector",
  "selectedLabels",
  "selectedSamples",
  "sessionGroupSlice",
  "sessionSpaces",
]);

export async function writeSession(
  datasetIdentifier: string,
  updater: (current: Omit<TeamsSession, "datasetIdentifier">) => Promise<void>
) {
  if (
    !teamsSessionRef ||
    teamsSessionRef.datasetIdentifier !== datasetIdentifier
  ) {
    const data = sessionStorage.getItem(datasetIdentifier);

    if (data) {
      teamsSessionRef = { datasetIdentifier, ...parseState(data) };
    } else {
      teamsSessionRef = { datasetIdentifier, ...TEAMS_SESSION_DEFAULT };
    }
  }
  await updater(teamsSessionRef);

  SESSION_KEYS.forEach((key) => {
    // @ts-ignore
    sessionRef[key] = teamsSessionRef[key];
  });

  const { datasetIdentifier: _, ...data } = teamsSessionRef;
  sessionStorage.setItem(datasetIdentifier, stringifyState(data));
}
// @ts-ignore
let teamsSessionRef: TeamsSession = {
  datasetIdentifier: "",
  selectedSamples: new Set(),
  selectedLabels: [],
  sessionSpaces: SPACES_DEFAULT,
};

let sessionRef: Session = {
  ...SESSION_DEFAULT,
};

function parseState(state: string): TeamsSessionState {
  const formattedState = JSON.parse(state);
  if (formattedState.selectedSamples)
    formattedState.selectedSamples = new Set(formattedState.selectedSamples);

  return formattedState;
}

function stringifyState(state: TeamsSessionState): string {
  const simplifiedState = {
    ...state,
    selectedSamples: Array.from(state.selectedSamples || new Set()),
  };
  return JSON.stringify(simplifiedState);
}
