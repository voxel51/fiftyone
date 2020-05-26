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

const _Sidebar = (props) => {
  const { state, connected, loading, showInfo, setShowInfo } = props;
  const hasDataset = Boolean(state && state.dataset);
  return (
    <Sidebar
      as={Menu}
      animation={"uncover"}
      vertical
      direction={"left"}
      visible={!loading}
    >
      <Menu.Item as="h3">
        <Image src={logo} alt="FiftyOne" />
      </Menu.Item>
      {hasDataset ? (
        <Menu.Item as="h3">
          <label style={{ color: "hsl(210, 20%, 90%) !important" }}>
            Overlay sample info
          </label>
          <Checkbox
            toggle
            style={{ padding: "none", float: "right" }}
            onClick={() => setShowInfo(!showInfo)}
            checked={showInfo}
          />
        </Menu.Item>
      ) : null}
      <Menu.Item as="h3">
        {!connected
          ? "Not connected"
          : hasDataset
          ? `Dataset: ${state.dataset.name}`
          : "No dataset loaded"}
        {hasDataset ? (
          <Menu vertical>
            <InfoItem k="Type" v="image" />
            <InfoItem k="Samples" v={state.count} />
            <InfoItem k="Selected" v={state.selected.length} />
          </Menu>
        ) : null}
      </Menu.Item>
      {hasDataset ? (
        <Menu.Item as="h4">
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
