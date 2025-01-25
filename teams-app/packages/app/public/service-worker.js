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

// note that we don't include video extensions here, since we expect that to be handled through destinations
// we include image extensions because we use `fetch()` to load images for masks and destinations might not be set
const supportedExtensions = [
  // masks
  "jpg",
  "jpeg",
  "png",
  // 3d related
  "pcd",
  "fo3d",
  "obj",
  "mtl",
  "stl",
  "ply",
  "fbx",
  "gltf",
  "glb",
  "bmp",
  "bin",
];

const authHeaderProps = {
  token: "",
  audience: "",
  authHeader: "Authorization",
  authPrefix: "Bearer",
  headerOverrides: {},
};

/**
 * We return true if any one of the following conditions are met, checked in order:
 * 1. If request.destination is in supportedDestinations
 * 2. If request.url.pathname ends with one of the supportedExtensions
 * 3. If request.url.searchParams has "filepath" key, and filepath ends with one of the supportedExtensions
 *
 * Note that (2) will work for signed URLs, whereas (3) for local URLs.
 */
const isRequestToBeModified = (request) => {
  // case 1
  if (supportedDestinations.includes(request.destination)) {
    return true;
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // case 2
  const hasValidExtension = (str) => {
    return supportedExtensions.some((ext) =>
      str.toLowerCase().endsWith(`.${ext}`)
    );
  };

  if (hasValidExtension(pathname)) {
    return true;
  }

  // case 3
  if (url.searchParams.has("filepath")) {
    const filepath = url.searchParams.get("filepath") || "";

    if (hasValidExtension(filepath)) {
      return true;
    }
  }

  return false;
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
      const requestUrlStr = event.request.url;

      const shouldModifyRequest = isRequestToBeModified(request);

      const { token, audience, authHeader, authPrefix } = authHeaderProps;
      const urlMatchesAudience =
        audience && audience.length > 0 && requestUrlStr.includes(audience);

      // Only modify external requests if token is available and the url matches the audience
      if (token && shouldModifyRequest && urlMatchesAudience) {
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
        // Allow the request to continue as normal and allow the browser to handle it
        return;
      }
    } catch (error) {
      console.error("Fetch handler encountered an error:", error);

      // Safely extract error details
      let errorMessage = "An unknown error occurred in the service worker.";
      if (error instanceof Error && error.message) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        try {
          errorMessage = JSON.stringify(error);
        } catch (jsonError) {
          // If the error details cannot be stringified, use a generic message to prevent circular references
          errorMessage = "Error details could not be stringified.";
        }
      }

      // Respond with a 500 error on failure
      event.respondWith(
        new Response(
          JSON.stringify({ message: `Service worker error: ${errorMessage}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }
  });
};
fetchEvent();
