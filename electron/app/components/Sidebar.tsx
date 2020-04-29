import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar } from "semantic-ui-react";

export default (props) => {
  console.log(props);
  return (
    <Sidebar
      as={Menu}
      animation={"overlay"}
      inverted
      vertical
      direction={"left"}
      visible={true}
    >
      <Menu.Item as="h3">FiftyOne</Menu.Item>
      <Menu.Item as="h5">View Info:</Menu.Item>
      <Menu.Item as="h5">Query Info:</Menu.Item>
      {props.update.state && props.update.state.pipeline
        ? Object.keys(props.update.state.pipeline).map((k) => {
            return (
              <Menu.Item as="h6">
                {String(Object.keys(props.update.state.pipeline[k])[0])}
              </Menu.Item>
            );
          })
        : null}
    </Sidebar>
  );
};
