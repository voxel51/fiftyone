import { Action } from "redux";
import { UPDATE } from "../actions/update";

export default function counter(state = 0, action: Action<string>) {
  switch (action.type) {
    case UPDATE:
      return state;
    default:
      return state;
  }
}
