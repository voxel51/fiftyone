import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar, Statistic } from "semantic-ui-react";

import connect from "../utils/connect";

const _Sidebar = (props) => {
  const { state } = props;
  const hasDataset = Boolean(state && state.dataset);
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
      </Menu.Item>
      {hasDataset ? (
        <>
          <Menu.Item as="h4">
            Page
            <Menu inverted vertical>
              {state && state.page
                ? Object.keys(state.page).map((k) => {
                    const v = state.page[k];
                    return (
                      <Menu.Item as="span">
                        {k}: {v}
                      </Menu.Item>
                    );
                  })
                : null}
            </Menu>
          </Menu.Item>
          <Menu.Item as="h4">
            View
            <Menu inverted vertical>
              <Menu.Item as="span">
                {state && state.view_tag ? state.view_tag : "No view"}
              </Menu.Item>
            </Menu>
          </Menu.Item>
          <Menu.Item as="h4">
            Query
            <Menu inverted vertical>
              {state && state.query ? (
                Object.keys(state.query).map((k) => {
                  return (
                    <Menu.Item as="span">
                      {String(Object.keys(state.query[k])[0])}
                    </Menu.Item>
                  );
                })
              ) : (
                <Menu.Item as="span">Empty query</Menu.Item>
              )}
            </Menu>
          </Menu.Item>
          <Menu.Item as="h4">
            Classes
            <Menu inverted vertical>
              {state && state.query ? (
                Object.keys(state.query).map((k) => {
                  return (
                    <Menu.Item as="span">
                      {String(Object.keys(state.query[k])[0])}
                    </Menu.Item>
                  );
                })
              ) : (
                <Menu.Item as="span">No classes</Menu.Item>
              )}
            </Menu>
          </Menu.Item>
        </>
      ) : null}
    </Sidebar>
  );
};

export default connect(_Sidebar);
