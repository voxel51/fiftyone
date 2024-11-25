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

const supportedMediaExtensions = [
  ".jpg",
  ".jpeg",
  ".bmp",
  ".gif",
  ".png",
  ".mpg",
  ".mp2",
  ".mpeg",
  ".mpe",
  ".mpv",
  ".mp4",
  ".pcd",
];
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
      const isImageOrVideoRequest =
        event.request.destination === "image" ||
        event.request.destination === "video";

      const { token, audience, authHeader, authPrefix } = authHeaderProps;
      const urlMatchesAudience =
        audience && audience.length > 0 && requestUrl.includes(audience);

      // Only modify external requests if token is available and the url matches the audience
      if (token && isImageOrVideoRequest && urlMatchesAudience) {
        // Create new request using the current request with modified headers for auth

        const modifiedHeaders = new Headers(event.request.headers);
        console.log("modifiedHeaders", modifiedHeaders);
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
        console.log("modifiedHeaders=", modifiedHeaders);
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
        console.log("fetchEvent modifiedRequest", modifiedRequest);

        event.respondWith(fetch(modifiedRequest));
      } else {
        // Allow the request to continue as normal
        event.respondWith(fetch(event.request));
      }
    } catch (error) {
      console.error("failed to fetch: ", error);
      e.respondWith(
        new Response(JSON.stringify({ message: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  });
};
fetchEvent();

// const fetchEvent = () => {
//   let jwt = "";
//   let jwtKeyName = "";
//   self.addEventListener("fetch", async (e) => {
//
//     try {
//       if (!jwt) {
//         jwt = new URLSearchParams(location.search).get("token");
//       }
//
//       // modifiable token key name
//       if (!jwtKeyName) {
//         jwtKeyName = new URLSearchParams(location.search).get("tokenKey");
//       }
//
//       // better way to detect (media) image/video
//       const destinationType = e.request.destination;
//       const path = e.request.url;
//       const isMediaRequest =
//         supportedDestinations.includes(destinationType) ||
//         supportedMediaExtensions.filter((mt) => path.includes(mt))?.length > 0;
//
//       if (!isMediaRequest || !jwt) {
//         if (!jwt) {
//           console.warn("cannot set token");
//         }
//         e.respondWith(fetch(e.request));
//         return;
//       }
//
//       // Clone headers and add 'jwt' property
//       const newHeaders = new Headers(e.request.headers);
//       newHeaders.set(jwtKeyName, jwt);
//
//       // Create a new request with the new headers
//       const modifiedRequest = new Request(e.request, {
//         headers: newHeaders,
//       });
//
//       e.respondWith(fetch(modifiedRequest));
//     } catch (error) {
//       console.error("failed to fetch: ", error);
//       e.respondWith(
//         new Response(JSON.stringify({ message: error.message }), {
//           status: 500,
//           headers: { "Content-Type": "application/json" },
//         })
//       );
//     }
//   });
// };
// fetchEvent();
