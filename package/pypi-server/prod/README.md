# Production PyPI Server Setup

This setup has been tested on a fresh Ubuntu 20.04 machine.

1. SSH into the server and clone this repo. `ssh -A` will allow you to clone
   the repo on the server using your local credentials.
2. Run `server-setup.bash` on the server to set up the server. During
   certificate installation, use `dev@voxel51.com` and enable HTTP-to-HTTPS
   forwarding if prompted.
3. Run `add-user.bash` on the server to set up an account for uploading
   packages.
