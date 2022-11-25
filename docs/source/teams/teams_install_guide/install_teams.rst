.. _install-teams:

Install FiftyOne Teams
==========================

.. default-role:: code

For a team of up to 10 users, it is recommended that FiftyOne Teams be deployed on a system with at least 16 GB of RAM and 4 vCPUs available.  FiftyOne Teams should be scaled by adding additional nodes to a load balancer or reverse proxy configuration to spread the load between multiple systems.

.. note::

	FiftyOne Teams requires an SSL endpoint in order to authorize logins.  The IP associated with the DNS record does not need to be exposed to the Internet, but a HTTPS endpoint with connectivity to https://login.fiftyone.ai is required.

.. note::

	If you use the Voxel51 directions for obtaining SSL Certificates through Let's Encrypt, `both port 80 and port 443 <https://letsencrypt.org/docs/allow-port-80/>`_ will have to be exposed to the Internet for certificate renewals.  You may provide your own SSL certificates instead.


.. _lets-encrypt-instructions:

Single-node FiftyOne Teams with Let's Encrypt certificates instructions
________________________________________________________________________

.. note::

	Single-Node deployments are not highly available.  If high-availability is critical to your FiftyOne Teams installation, using a MongoDB Atlas Dedicated Cluster deployment is recommended.

**Install Docker and snapd**

You will need:

* A host identified as the FiftyOne Teams application host (fiftyone-appnode)

The following is a summary of the instructions from `Docker <https://docs.docker.com/engine/install/debian/>`_ and `snapcraft <https://snapcraft.io/docs/installing-snapd>`_.

If you are attempting an install on a non Debian-based system, please refer to the appropriate `Docker <https://docs.docker.com/engine/install/>`_ and `snapcraft <https://snapcraft.io/docs/installing-snapd>`_ documentation for your operating system.


.. code-block:: shell
	:caption: Install Docker dependencies

	sudo apt-get update
	sudo apt-get install -y \
		apt-transport-https \
		ca-certificates \
		curl \
		gnupg \
		lsb-release

.. code-block:: shell
	:caption: Configure the Docker repository

	curl -fsSL https://download.docker.com/linux/debian/gpg | \
		sudo gpg --dearmor \
		-o /usr/share/keyrings/docker-archive-keyring.gpg
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
		| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null


.. code-block:: shell
	:caption: Install Docker and Snap

	sudo apt-get update
	sudo apt-get install -y \
		docker-ce \
		docker-ce-cli \
		containerd.io \
		snapd
	sudo snap install core
	sudo snap refresh core

**Build the FiftyOne Teams image**

You will need:

* The automation token obtained at the beginning of the install process
* The FiftyOne Teams Dockerfile obtained at the beginning of the install process
* The system you just configured with Docker and snapd (fiftyone-appnode)

Review the Dockerfile to confirm that any python dependencies (e.g. tensorflow, torch) you require for your implementation have been included in the container.

|

Copy the Dockerfile to fiftyone-appnode.

On fiftyone-appnode, set a ``TOKEN`` variable with the content of the Voxel51 automation token.

.. code-block:: shell

	export TOKEN=<automation token from Voxel51>


On fiftyone-appnode, in the directory with the Dockerfile, build the FiftyOne Teams container.

.. code-block:: shell

	sudo docker build --build-arg TOKEN=${TOKEN} \
		-t voxel51/fiftyone-teams-app .

**Set your MongoDB Connection String Parameters**

You will need:

* The host where the FiftyOne Teams will be deployed (fiftyone-appnode)

Using the information from the **Install MongoDB ADD LINK!!!** section of this document, set the following environment variables on fiftyone-appnode.

.. note::

	You should always update ``FIFTYONE_DB_USERNAME`` and ``FIFTYONE_DB_PASSWORD``.

.. note::

	If you used the Voxel51 Terraform module to deploy your infrastructure on Google Cloud, the hostname of the database server will be ``fiftyone-dbnode``. If you did not use the Voxel51 Terraform please update the ``FIFTYONE_DB_HOSTNAME`` appropriately.

.. code-block:: shell

	FIFTYONE_DB_USERNAME=whateverYouUsedBefore
	FIFTYONE_DB_PASSWORD=thePasswordYouSetEarlier
	FIFTYONE_DB_HOSTNAME=fiftyone-dbnode
	FIFTYONE_DB_PORT=27017

Combine all of those parameters to create a Mongo Connection String.

.. code-block:: shell

	MONGODB_CONNECTION_STRING="mongodb://${FIFTYONE_DB_USERNAME}:${FIFTYONE_DB_PASSWORD}@${FIFTYONE_DB_HOSTNAME}:${FIFTYONE_DB_PORT}/?authSource=admin"

The remainder of these instructions assume these environment variables have been set and are available.

**Deploy the FiftyOne Teams container**

You will need:

* The host where the FiftyOne Teams image was built (fiftyone-appnode)
* The FiftyOne Teams Organization ID obtained at the beginning of the install process

Set environment variables with the value of your **Organization ID and Client ID Add LINK!!!**.


.. code-block:: shell

	FIFTYONE_TEAMS_ORGANIZATION=org_YourOrgIDHere
	FIFTYONE_TEAMS_CLIENT_ID=ClientIDString


Run the FiftyOne Teams Container.

.. code-block:: shell

	sudo docker run -d \
		-e FIFTYONE_DATABASE_URI="${MONGODB_CONNECTION_STRING}" \
		-e FIFTYONE_DATABASE_ADMIN=true \
		-e FIFTYONE_TEAMS_ORGANIZATION="${FIFTYONE_TEAMS_ORGANIZATION}" \
		-e FIFTYONE_TEAMS_CLIENT_ID="${FIFTYONE_TEAMS_CLIENT_ID}" \
		--restart unless-stopped \
		--name fiftyone-teams-app \
		voxel51/fiftyone-teams-app

Verify that the FiftyOne Teams application started successfully by checking the logs.

.. code-block:: shell

	sudo docker logs fiftyone-teams-app

should result in

.. code-block::

	Migrating database to v<some version number>
	[date] [6] [INFO] Running on http://0.0.0.0:5151 (CTRL + C to quit)
	Running on http://0.0.0.0:5151 (CTRL + C to quit)

**Deploy SSL Endpoint with Certbot and Let's Encrypt SSL Certificates**

You will need:

* The host where the FiftyOne Teams container was deployed (fiftyone-appnode)
* Firewall rules allowing access to ports 80 and 443 on fiftyone-appnode
* Internet connectivity

Certbot is a tool for automating the creation, installation, and refresh of SSL certificates generated by `Let's Encrypt <https://letsencrypt.org/>`_.

The following directions are a summary of the information available at `certbot.eff.org <https://certbot.eff.org/>`_. Details regarding certbot are available at that same site.

Set an environment variable to represent the public DNS name for your site, and an email address to register the certificates.

.. note::

	You will need to update both ``MYNAME`` and ``EMAIL`` to reflect appropriate values for your installation.


.. code-block::

	MYNAME=somename.fiftyone.ai
	EMAIL="somegroup@somename.com"

Install certbot, generate SSL certificates, and generate Diffie-Hellman field-primes and generators (dhparams).

.. code-block:: shell

	sudo snap install --classic certbot
	sudo ln -s /snap/bin/certbot /usr/bin/certbot
	sudo certbot certonly -d "${MYNAME}" \
		--standalone --agree-tos \
		--email "${EMAIL}" \
		-n
	sudo openssl dhparam -out /etc/letsencrypt/live/${MYNAME}/dhparam.pem 4096

Generating a 4096-bit dhparam file can take a little while. It's probably a good time to go refresh your water bottle.

Once the dhparam file is finished being generated, deploy the Nginx SSL endpoint and reverse proxy.

.. code-block:: shell

	sudo docker run -d -p 443:443 -p 80:80 -e ENABLE_SSL=true \
		-e TARGET_SERVICE=fiftyone-teams-app:5151 \
		-e SERVER_NAME=${MYNAME} \
		-v /etc/letsencrypt/live/${MYNAME}/fullchain.pem:/etc/secrets/proxycert \
		-v /etc/letsencrypt/live/${MYNAME}/privkey.pem:/etc/secrets/proxykey \
		-v /etc/letsencrypt/live/${MYNAME}/dhparam.pem:/etc/secrets/dhparam \
		--restart unless-stopped --name fiftyone-nginx \
		--link fiftyone-teams-app \
		ployst/nginx-ssl-proxy

Make sure that the SSL endpoint and reverse proxy container started correctly by checking the logs.

.. code-block:: shell

	sudo docker logs fiftyone-nginx

should result in

.. code-block::

	Enabling SSL...
	Starting nginx...

You should now be able to connect to your FiftyOne Teams instance using your SSL-Protected callback URL. You only need to read further if you would like to customize your FiftyOne Teams installation..


.. _deploy-teams-by-self:

Deploying FiftyOne Teams by yourself
_____________________________________

The following provides some guidelines for building and deploying the FiftyOne Teams container.

**Build the FiftyOne Teams image**

You will need:

* The automation token obtained at the beginning of the install process
* The FiftyOne Teams Dockerfile obtained at the beginning of the install process
* A system with Docker installed and running

Review the Dockerfile to confirm that any python dependencies (e.g. tensorflow, torch) you require for your implementation have been included in the container.

On a system that has Docker installed and running, in a directory that contains the Dockerfile, run the following command to build the container:

.. code:: shell

	export TOKEN=<automation token from Voxel51>
	docker build --build-arg TOKEN=${TOKEN} -t voxel51/fiftyone-teams-app .

Please review the Dockerfile for other build arguments that can be used to modify your container to meet your specific use case.

.. note::

	If you plan to use this image on a system other than where it was built, you will need to push this image to a container registry which is beyond the scope of this guide.


**Deploy the FiftyOne Teams container**

You will need:

* Your `MongoDB Connection String <https://www.mongodb.com/docs/v4.4/reference/connection-string/>`_
* The FiftyOne Teams Organization ID obtained at the beginning of the install process
* A mechanism for running Containers

When you run your container in any context, you will need expose port 5151 (or map port 5151 to an approved port) and the application will require the following environment variables:

.. code-block:: shell

	FIFTYONE_DATABASE_URI=<your MongoDB Connection String>
	FIFTYONE_TEAMS_ORGANIZATION=<your FiftyOne Teams Organization ID>

Setting ``FIFTYONE_DATABASE_ADMIN`` to true on more than one container will result in each container attempting to roll out database migrations during upgrade activities. This is unlikely to cause issues, but it is generally recommended that only the first container instance be set to manage the database migrations.

An example of running this container on the host where it was built would be:

.. code-block:: shell

	docker run -d -p 0.0.0.0:5151:5151 \
		-e FIFTYONE_DATABASE_URI=mongodb://u:pass@node:27017/?authSource=admin \
		-e FIFTYONE_TEAMS_ORGANIZATION=org_FakeOrgID1234 \
		--restart unless-stopped --name fiftyone-teams-app \
		voxel51/fiftyone-teams-app

.. note::
	
	You will not be able to access the application on port 5151 without first passing through an SSL Endpoint and FiftyOne Teams Authentication.

**Deploy an SSL Endpoint**

FiftyOne Teams requires an SSL endpoint in order to authorize logins.  The IP associated with the DNS record does not need to be exposed to the Internet, but a HTTPS endpoint with connectivity to https://login.fiftyone.ai is required.

Traffic sent to the SSL Endpoint should be routed to port 5151 on the FiftyOne Teams container.  FiftyOne Teams is a stateless frontend so no sticky routes or persistent connections need to be established as part of the proxy service.




