import { connect } from "react-redux";

const mapStateToProps = (state) => {
  return {
    state: state.update.state,
    socket: state.update.socket,
  };
};

export default (component) => connect(mapStateToProps)(component);
