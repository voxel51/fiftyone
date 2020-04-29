import { Action } from "redux";
import { UPDATE } from "../actions/update";

export default function update(state = {}, action) {
  console.log(action);
  switch (action.type) {
    case UPDATE:
      alert("fsgs");
      return { ...state, state: action.data };
    default:
      return state;
  }
}
