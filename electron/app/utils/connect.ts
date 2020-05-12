import { connect } from "react-redux";

const mapStateToProps = (state) => {
  return {
    state: state.update.state,
    port: state.update.port,
    connected: state.update.connected,
  };
};

export default (component) => connect(mapStateToProps)(component);
