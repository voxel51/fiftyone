import PropTypes from "prop-types";
import React, { Component } from "react";
import { Grid, Image, Menu, Sidebar } from "semantic-ui-react";

export default (props) => {
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
      <Menu.Item as="h4">
        {props.update.state ? (
          <>Dataset: {props.update.state.dataset_name}</>
        ) : (
          <>No dataset loaded</>
        )}
      </Menu.Item>
      <Menu.Item as="h5">Page Info:</Menu.Item>
      {props.update.state && props.update.state.page
        ? Object.keys(props.update.state.page).map((k) => {
            const v = props.update.state.page[k];
            return (
              <Menu.Item as="h5">
                {k} : {v}
              </Menu.Item>
            );
          })
        : null}
      <Menu.Item as="h5">View Info:</Menu.Item>
      <Menu.Item as="h5">
        {props.update.state && props.update.state.view_tag
          ? props.update.state.view_tag
          : "No view"}
      </Menu.Item>
      <Menu.Item as="h5">Query Info:</Menu.Item>
      {props.update.state && props.update.state.query ? (
        Object.keys(props.update.state.query).map((k) => {
          return (
            <Menu.Item as="h5">
              {String(Object.keys(props.update.state.query[k])[0])}
            </Menu.Item>
          );
        })
      ) : (
        <Menu.Item as="h5">Empty query</Menu.Item>
      )}
    </Sidebar>
  );
};
