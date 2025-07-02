import { sessionAtom } from "../session";

export const canEditSavedViews = sessionAtom({
  key: "canEditSavedViews",
  default: { enabled: true, message: null },
});

export const canEditWorkspaces = sessionAtom({
  key: "canEditWorkspaces",
  default: { enabled: true, message: null },
});

export const canEditCustomColors = sessionAtom({
  key: "canEditCustomColors",
  default: { enabled: true, message: null },
});

export const canCreateNewField = sessionAtom({
  key: "canCreateNewField",
  default: { enabled: true, message: null },
});

export const canModifySidebarGroup = sessionAtom({
  key: "canModifySidebarGroup",
  default: { enabled: true, message: null },
});

export const canTagSamplesOrLabels = sessionAtom({
  key: "canTagSamplesOrLabels",
  default: { enabled: true, message: null },
});

export const readOnly = sessionAtom({
  key: "readOnly",
  default: false,
});
