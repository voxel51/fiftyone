import { setView, setViewMutation } from "@fiftyone/relay";
import { datasetName, stateSubscription } from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { RegisteredSetter } from "./registerSetter";

const onSetViewName: RegisteredSetter =
  ({ environment, router, sessionRef }) =>
  ({ get, set }, slug: string | DefaultValue | null) => {
    set(pendingEntry, true);
    if (slug instanceof DefaultValue) {
      slug = null;
    }
    const params = new URLSearchParams(router.get().search);
    const current = params.get("view");
    if (current === slug) {
      return;
    }

    if (slug) {
      params.set("view", slug);
    } else {
      params.delete("view");
    }

    let search = params.toString();
    if (search.length) {
      search = `?${search}`;
    }

    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables: {
        subscription: get(stateSubscription),
        view: [],
        savedViewSlug: slug,
        datasetName: get(datasetName) as string,
        form: {},
      },
    });

    sessionRef.current.selectedLabels = [];
    sessionRef.current.selectedSamples = new Set();
    sessionRef.current.fieldVisibilityStage = undefined;
    router.history.push(`${router.get().pathname}${search}`, {
      view: [],
    });
  };

export default onSetViewName;
