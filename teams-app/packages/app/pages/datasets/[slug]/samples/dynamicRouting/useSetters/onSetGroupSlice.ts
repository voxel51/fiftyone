import {
  type HistoryState,
  SLICE_EVENT,
  getHistoryState,
  replaceHistoryState,
} from "../state";
import { writeSession } from "../useLocalSession";
import type { RegisteredSetter } from "./registerSetter";

const onSetGroupSlice: RegisteredSetter = () => async (_, slice: string) => {
  // create new state
  const { slice: __, ...state } = getHistoryState();
  const newState: HistoryState = {
    ...state,
    event: SLICE_EVENT,
    slice,
  };

  // write the slice to browser storage
  await writeSession(state.datasetId, async (session) => {
    session.sessionGroupSlice = slice;
  });

  // update window.location.state
  replaceHistoryState(newState);
};

export default onSetGroupSlice;
