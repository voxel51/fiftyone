/* jshint esversion: 8 */
/* jshint browser: true */
/* jshint worker: true */
/* jshint node: true */
"use strict";

/**
 * Service worker
 * A service worker responsible for attaching jwt token to all fetch requests
 * that are considered media (image, video, pcd, masks)
 */

const installEvent = () => {
  self.addEventListener("install", (event) => {
    console.log("service worker installed");
    // so updates take effect immediately
    self.skipWaiting();
  });
};
installEvent();

const activateEvent = () => {
  self.addEventListener("activate", (event) => {
    console.log("service worker activated");
    // spin up immediately
    event.waitUntil(self.clients.claim());
  });
};
activateEvent();

const supportedDestinations = ["image", "video"];

const authHeaderProps = {
  token: "",
  audience: "",
  authHeader: "Authorization",
  authPrefix: "Bearer",
  headerOverrides: {},
};

const messageEvent = () => {
  self.addEventListener("message", (event) => {
    const { accessToken, audience, authHeader, authPrefix, headerOverrides } =
      event.data || {};

    // Always update the token and audience when a message is received regardless of their values
    authHeaderProps.token = accessToken;
    authHeaderProps.audience = audience;
    if (authHeader) {
      authHeaderProps.authHeader = authHeader;
    }
    if (authPrefix) {
      authHeaderProps.authPrefix = authPrefix;
    }
    if (headerOverrides) {
      authHeaderProps.headerOverrides = headerOverrides;
    }
  });
};
messageEvent();

const fetchEvent = () => {
  self.addEventListener("fetch", async (event) => {
    try {
      const request = event.request;
      const requestUrl = event.request.url;
      const isImageOrVideoRequest = supportedDestinations.includes(
        event.request.destination
      );

      const { token, audience, authHeader, authPrefix } = authHeaderProps;
      const urlMatchesAudience =
        audience && audience.length > 0 && requestUrl.includes(audience);

      // Only modify external requests if token is available and the url matches the audience
      if (token && isImageOrVideoRequest && urlMatchesAudience) {
        // Create new request using the current request with modified headers for auth

        const modifiedHeaders = new Headers(event.request.headers);
        if (Object.keys(authHeaderProps.headerOverrides).length > 0) {
          for (const [header, value] of Object.entries(
            authHeaderProps.headerOverrides
          )) {
            if (value) {
              modifiedHeaders.set(header, value);
            }
          }
        }

        // Do not add auth header to OPTIONS (prefetch) requests
        if (event.request.method !== "OPTIONS") {
          modifiedHeaders.set(authHeader, `${authPrefix} ${token}`);
        }
        // Create a new request with the modified properties by explicitly setting them.
        // Otherwise, the options will be ignored if they are already set in the original request.
        const modifiedRequest = new Request(event.request.url, {
          url: request.url,
          method: request.method,
          mode: "cors",
          credentials: "include",
          cache: request.cache,
          redirect: request.redirect,
          referrer: request.referrer,
          headers: modifiedHeaders,
        });

        event.respondWith(fetch(modifiedRequest));
      } else {
        // Allow the request to continue as normal
        event.respondWith(fetch(event.request));
      }
    } catch (error) {
      console.error("failed to fetch: ", error);
      event.respondWith(
        new Response(JSON.stringify({ message: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  });
};
fetchEvent();
