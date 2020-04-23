import { expect } from "chai";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import actions from "../../app/renderer/actions/user";

const mockStore = configureMockStore([thunk]);

describe("actions", () => {
  describe("user", () => {
    it("should log in", () => {
      const store = mockStore({});
      const expectedActions = [
        {
          type: "USER_LOGIN",
          payload: {
            username: "John Doe",
            loggedIn: true,
          },
        },
      ];

      store.dispatch(
        actions.login({
          username: "John Doe",
          loggedIn: true,
        })
      );

      expect(store.getActions()).deep.equal(expectedActions);
    });

    it("should logout", () => {
      const store = mockStore({});
      const expectedActions = [
        {
          type: "USER_LOGOUT",
          payload: {
            username: "",
            loggedIn: false,
          },
        },
      ];

      store.dispatch(
        actions.logout({
          username: "",
          loggedIn: false,
        })
      );

      expect(store.getActions()).deep.equal(expectedActions);
    });
  });
});
