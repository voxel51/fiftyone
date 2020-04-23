import { connect } from "react-redux";
import { push } from "connected-react-router";
import { bindActionCreators } from "redux";
import Login from "../components/Login";
import userActions from "../actions/user";

const mapStateToProps = (state) => {
  return state;
};

const mapDispatchToProps = (dispatch) => {
  const user = bindActionCreators(userActions, dispatch);
  return {
    onLogin: (data) => {
      user.login(data);
      dispatch(push("/loggedin"));
    },
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Login);
