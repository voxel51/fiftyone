/**
 * Service worker
 * A service worker responsible for attaching jwt token to all fetch requests
 * that are considered media (image, video, pcd, masks)
 */

const installEvent = () => {
  self.addEventListener('install', (event) => {
    console.log('service worker installed');
    // so updates take effect immediately
    self.skipWaiting();
  });
};
installEvent();

const activateEvent = () => {
  self.addEventListener('activate', (event) => {
    console.log('service worker activated');
    // spin up immediately
    event.waitUntil(self.clients.claim());
  });
};
activateEvent();

const supportedMediaExtensions = [
  '.jpg',
  '.jpeg',
  '.bmp',
  '.gif',
  '.png',
  '.mpg',
  '.mp2',
  '.mpeg',
  '.mpe',
  '.mpv',
  '.mp4',
  '.pcd'
];
const supportedDestinations = ['image', 'video'];
const fetchEvent = () => {
  let jwt = '';
  let jwtKeyName = '';
  self.addEventListener('fetch', async (e) => {
    try {
      if (!jwt) {
        jwt = new URLSearchParams(location.search).get('token');
      }

      // modifiable token key name
      if (!jwtKeyName) {
        jwtKeyName = new URLSearchParams(location.search).get('tokenKey');
      }

      // better way to detect (media) image/video
      const destinationType = e.request.destination;
      const path = e.request.url;
      const isMediaRequest =
        supportedDestinations.includes(destinationType) ||
        supportedMediaExtensions.filter((mt) => path.includes(mt))?.length > 0;

      if (!isMediaRequest || !jwt) {
        if (!jwt) {
          console.warn('cannot set token');
        }
        e.respondWith(fetch(e.request));
        return;
      }

      // Clone headers and add 'jwt' property
      const newHeaders = new Headers(e.request.headers);
      newHeaders.set(jwtKeyName, jwt);

      // Create a new request with the new headers
      const modifiedRequest = new Request(e.request, {
        headers: newHeaders
      });

      e.respondWith(fetch(modifiedRequest));
    } catch (error) {
      console.error('failed to fetch: ', error);
      e.respondWith(
        new Response(JSON.stringify({ message: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
  });
};
fetchEvent();
