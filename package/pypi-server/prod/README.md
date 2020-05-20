# Production PyPI Server Setup

These steps were performed on an Ubuntu 20.04 machine, but should also work in
similar environments without significant changes.

1. Install system packages:
   `sudo apt install certbot docker.io docker-compose nginx python3-certbot-nginx`
2. Copy `pypi.voxel51.com.conf` from this folder to `/etc/nginx/sites-enabled`
3. Run `sudo certbot --nginx -d pypi.voxel51.com` - use `dev@voxel51.com` as
   the email address if prompted
