import { Action } from "redux";
import { UPDATE } from "../actions/update";

export default function state(state = {}, action) {
  switch (action.type) {
    case UPDATE:
      return { ...state, state: action.data };
    default:
      return state;
  }
}
