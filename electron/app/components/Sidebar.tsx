import electron from "electron";
import PropTypes from "prop-types";
import React, { Component } from "react";
import {
  Checkbox,
  Grid,
  Image,
  Menu,
  Sidebar,
  Statistic,
  Button,
} from "semantic-ui-react";

import InfoItem from "./InfoItem";
import logo from "../logo.png";
import connect from "../utils/connect";
import Rendering from "./Rendering";

const _Sidebar = (props) => {
  const {
    state,
    connected,
    loading,
    showInfo,
    setShowInfo,
    displayProps,
  } = props;
  const hasDataset = Boolean(state && state.dataset);
  return (
    <Sidebar
      as={Menu}
      animation={"uncover"}
      vertical
      direction={"left"}
      visible={!loading}
      className="fo-sidebar"
    >
      <Menu.Item as="h3">
        <Image src={logo} alt="FiftyOne" />
      </Menu.Item>
      <Menu.Item as="h3">
        {!connected
          ? "Not connected"
          : hasDataset
          ? "Dataset"
          : "No dataset loaded"}
        {hasDataset ? (
          <Menu vertical>
            <InfoItem k="Name" v={state.dataset.name} />
            <InfoItem k="Type" v="image" />
            <InfoItem k="Samples" v={state.count} />
            <InfoItem k="Selected" v={state.selected.length} />
          </Menu>
        ) : null}
      </Menu.Item>
      {hasDataset ? <Rendering displayProps={displayProps} /> : null}
      {hasDataset ? (
        <Menu.Item as="h3">
          View
          <Menu vertical>
            <Menu.Item as="span" style={{ overflowX: "auto" }}>
              {state && state.view
                ? JSON.stringify(JSON.parse(state.view.view), null, 2)
                : "Empty view"}
            </Menu.Item>
          </Menu>
        </Menu.Item>
      ) : null}
      <Menu.Item as="h4">
        <Button
          className="help"
          onClick={(e) => {
            e.preventDefault();
            electron.shell.openExternal(
              "https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg"
            );
          }}
        >
          Need help? We're on Slack.
        </Button>
      </Menu.Item>
    </Sidebar>
  );
};

export default connect(_Sidebar);
