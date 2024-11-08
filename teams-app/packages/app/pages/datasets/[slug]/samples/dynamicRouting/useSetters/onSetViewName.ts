import { setView, setViewMutation } from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { getHistoryState, pushHistoryState } from "../state";
import { writeSession } from "../useLocalSession";
import { RegisteredSetter } from "./registerSetter";

const onSetViewName: RegisteredSetter =
  ({ environment }) =>
  async (_, viewName: string | DefaultValue | null) => {
    const view = viewName instanceof DefaultValue || !viewName ? [] : viewName;
    const { view: __, ...state } = getHistoryState();

    // update browser storage
    await writeSession(state.datasetId, async (session) => {
      session.fieldVisibilityStage = undefined;
      session.selectedSamples = new Set();
      session.selectedLabels = [];
      session.view = view;
    });

    // update view activity
    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables: {
        view: [],
        savedViewSlug: typeof view === "string" ? view : null,
        datasetName: state.datasetName,
        subscription: "",
        form: {},
      },
    });

    // transition to next page
    await pushHistoryState({ ...state, fieldVisibilityStage: undefined, view });
  };

export default onSetViewName;
