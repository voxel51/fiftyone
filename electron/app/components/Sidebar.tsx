import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar, Statistic } from "semantic-ui-react";

import connect from "../utils/connect";

const _Sidebar = (props) => {
  const { state, connected, loading } = props;
  const hasDataset = Boolean(state && state.dataset);
  return (
    <Sidebar
      as={Menu}
      animation={"uncover"}
      inverted
      vertical
      direction={"left"}
      visible={connected && !loading}
    >
      <Menu.Item as="h2">FiftyOne</Menu.Item>
      <Menu.Item as="h3">
        {hasDataset ? `Dataset: ${state.dataset.name}` : "No dataset loaded"}
        {hasDataset ? (
          <Menu inverted vertical>
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
      <>
        <Menu.Item as="h4">
          View
          <Menu inverted vertical>
            <Menu.Item as="div" style={{ overflowX: "auto" }}>
              <pre>
                {state && state.view
                  ? JSON.stringify(JSON.parse(state.view.view), null, 2)
                  : "Empty view"}
              </pre>
            </Menu.Item>
          </Menu>
        </Menu.Item>
      </>
    </Sidebar>
  );
};

export default connect(_Sidebar);
