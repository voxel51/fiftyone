import { connect } from "react-redux";

const mapStateToProps = (state) => {
  return {
    state: state.update.state,
    port: state.update.port,
    connected: state.update.connected,
    loading: state.update.loading,
  };
};

export default (component) => connect(mapStateToProps)(component);
