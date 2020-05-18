import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar, Statistic } from "semantic-ui-react";

import logo from "../logo.png";
import connect from "../utils/connect";

const _Sidebar = (props) => {
  const { state, connected, loading } = props;
  const hasDataset = Boolean(state && state.dataset);
  return (
    <Sidebar
      as={Menu}
      animation={"uncover"}
      vertical
      direction={"left"}
      visible={!loading}
      color="background"
    >
      <Menu.Item as="h3">
        <Image src={logo} alt="FiftyOne" />
      </Menu.Item>
      <Menu.Item as="h3">
        {!connected
          ? "Not connected"
          : hasDataset
          ? `Dataset: ${state.dataset.name}`
          : "No dataset loaded"}
        {hasDataset ? (
          <Menu vertical>
            <Menu.Item as="span">
              Type &middot; <code>image</code>
            </Menu.Item>
            <Menu.Item as="span">
              Samples &middot; <code>{state.count}</code>
            </Menu.Item>
            <Menu.Item as="span">
              Selected &middot; <code>{state.selected.length}</code>
            </Menu.Item>
            <Menu.Item as="span">
              Shape &middot; <code>({state.count},32,32,3)</code>
            </Menu.Item>
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
