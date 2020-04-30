import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar } from "semantic-ui-react";

export default () => (
  <Sidebar
    as={Menu}
    animation={"overlay"}
    inverted
    vertical
    direction={"left"}
    visible={true}
  >
    <Menu.Item as="h3">FiftyOne</Menu.Item>
  </Sidebar>
);
