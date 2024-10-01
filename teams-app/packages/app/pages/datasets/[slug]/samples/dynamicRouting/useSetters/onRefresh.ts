import { getHistoryState } from "../state";
import { transition } from "../transition";
import type { RegisteredSetter } from "./registerSetter";

const onRefresh: RegisteredSetter = (_) => async () => {
  await transition(getHistoryState(), true);
};

export default onRefresh;
