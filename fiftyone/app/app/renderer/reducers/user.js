import { handleActions } from "redux-actions";
import actions from "../actions/user";

export default handleActions(
  {
    [actions.login]: (state, action) => {
      return { ...state, ...action.payload };
    },
    [actions.logout]: (state, action) => {
      return { ...state, ...action.payload };
    },
  },
  {}
);
