import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar, Statistic } from "semantic-ui-react";

import connect from "../utils/connect";

const _Sidebar = (props) => {
  const { state } = props;
  const hasDataset = Boolean(state && state.dataset);
  console.log(state);
  return (
    <Sidebar
      as={Menu}
      animation={"overlay"}
      inverted
      vertical
      direction={"left"}
      visible={true}
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
            <Menu.Item as="pre">
              {state && state.view
                ? JSON.stringify(state.view.view, null, 2)
                : "Empty view"}
            </Menu.Item>
          </Menu>
        </Menu.Item>
      </>
    </Sidebar>
  );
};

export default connect(_Sidebar);
