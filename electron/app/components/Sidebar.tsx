import PropTypes from "prop-types";
import React, { Component } from "react";
import {
  Checkbox,
  Grid,
  Image,
  Menu,
  Sidebar,
  Statistic,
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
      <Rendering displayProps={displayProps} />
      {hasDataset ? (
        <Menu.Item as="h3">
          View
          <Menu vertical>
            <Menu.Item as="div" style={{ overflowX: "auto" }}>
              <pre>
                {state && state.view
                  ? JSON.stringify(JSON.parse(state.view.view), null, 2)
                  : "Empty view"}
              </pre>
            </Menu.Item>
          </Menu>
        </Menu.Item>
      ) : null}
    </Sidebar>
  );
};

export default connect(_Sidebar);
