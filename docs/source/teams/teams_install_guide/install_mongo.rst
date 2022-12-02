.. _install-mongo:

Install MongoDB
==========================

.. default-role:: code

FiftyOne Teams uses MongoDB for metadata storage. The first step to deploying FiftyOne Teams is to provide a centralized, always-on MongoDB instance in the environment of your choice (cloud or  on-premises).

FiftyOne Teams requires a MongoDB user account that is a member of the root role.

When you deploy your FiftyOne Teams server or the FiftyOne Teams python clients, you will need a `MongoDB connection string <https://www.mongodb.com/docs/v4.4/reference/connection-string/>`_, which should have the following format:

.. code-block:: shell
	
	mongodb://username:password@host1:port1[...,hostN:portN]/?authSource=admin

.. _deployment-considerations:

Deployment considerations
__________________________

* By default, Mongo will set the wiredTigerCacheSizeGB to a value proportional to the host’s total memory, regardless of memory limits imposed on the container. It is recommended that MongoDB be deployed on a separate host than the FiftyOne Teams installation. If you choose to install MongoDB and FiftyOne Teams on the same host you should limit the WiredTiger cache by following `MongoDB’s WiredTiger Options instructions <https://www.mongodb.com/docs/v4.4/reference/program/mongod/#wiredtiger-options>`_.
* Before deploying your MongoDB infrastructure, please review the Voxel51 FiftyOne Teams Database Cost Analysis document for information regarding sizing estimates.  In summary, for a team of up to 10 users, it is recommended that MongoDB have 64GB+ of RAM and 16+ vCPUs.
* For performance and administrative ease, it is recommended that the MongoDB database data is stored outside the docker container, `on an XFS filesystem <https://www.mongodb.com/docs/v4.4/administration/production-notes/#kernel-and-file-systems>`_.  These instructions include directions on how to configure an external volume at /opt/mongodb/data. You may wish to attach an additional persistent disk at that location, or otherwise modify these directions to comply with your storage standards.
* FiftyOne Teams is designed for MongoDB v4.4.  These instructions assume the deployment of **MongoDB v4.4**, but you can modify them to use MongoDB v5 by following :ref:`these instructions <using-a-different-mongodb-version>` and updating the tag on the docker image pulled in the **Install MongoDB step ADD LINK!!!**.
* These instructions provision an initial administrative user for MongoDB, but you may consider creating additional administrative users for internal activities like backups and database maintenance.
* These instructions do not include `backing up <https://www.mongodb.com/docs/v4.4/core/backups/>`_ or `monitoring <https://www.mongodb.com/docs/v4.4/administration/monitoring/>`_ your MongoDB installation. For information regarding these and other administrative tasks, please refer to the `MongoDB Administration <https://www.mongodb.com/docs/v4.4/administration/>`_ documentation.

If you have chosen to use an existing MongoDB installation or MongoDB Atlas for your deployment, please collect your MongoDB connection string details and proceed.

.. _single-node-installation:

Single-node MongoDB installation instructions
______________________________________________

.. note::
	
	Single-Node deployments are not highly available. If high-availability is critical to your FiftyOne Teams installation, using a MongoDB Atlas Dedicated Cluster deployment is recommended.

Install Docker
----------------

The following is a summary of the instructions from `Docker <https://docs.docker.com/engine/install/debian/>`_.

If you are attempting an install on a non Debian-based system, please refer to the `appropriate documentation for your operating system <https://docs.docker.com/engine/install/>`_.

.. code-block:: shell
   :caption: Install docker dependencies

	sudo apt-get update
	sudo apt-get install -y \
		apt-transport-https \
		ca-certificates \
		curl \
		gnupg \
		lsb-release

.. code-block:: shell
   :caption: Add the Docker repository

	curl -fsSL https://download.docker.com/linux/debian/gpg | \
		sudo gpg --dearmor \
		-o /usr/share/keyrings/docker-archive-keyring.gpg
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
		| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null


.. code-block:: shell
   :caption: Install Docker Community Edition

	sudo apt-get update
	sudo apt-get install -y \
		docker-ce \
		docker-ce-cli \
		containerd.io

Prepare MongoDB Data Directory
--------------------------------

.. code-block:: shell
	:caption: Create mongodb data directory

	sudo mkdir -p /opt/mongodb/data
	sudo chgrp -R docker /opt/mongodb

If you have chosen to mount a persistent storage volume for MongoDB data use, follow the directions for your infrastructure provider to provision, format, and mount the drive at startup.


Install MongoDB
----------------

Do not copy and paste the following commands; you should create your own admin username and password for MongoDB.

.. code-block:: shell
	:caption: Configure your Mongo Admin account username and password

	FIFTYONE_DB_USERNAME=mongoadmin
	FIFTYONE_DB_PASSWORD=copyandpastepassword

You will want to record your ``FIFTYONE_DB_USERNAME`` and ``FIFTYONE_DB_PASSWORD`` to construct your MongoDB Connection String during your FiftyOne Teams deployment.

.. code-block:: shell
	:caption: Pull and run the Mongo 4.4 container

	sudo docker pull mongo:4.4
	sudo docker run -d -p 27017:27017 --restart unless-stopped \
		--name fiftyone_mongodb \
		-e MONGO_INITDB_ROOT_PASSWORD=${FIFTYONE_DB_PASSWORD} \
		-e MONGO_INITDB_ROOT_USERNAME=${FIFTYONE_DB_USERNAME} \
		-v /opt/mongodb/data:/data/db \
		mongo:4.4

Verify the MongoDB Install
----------------------------

While these steps are not necessary, they will ensure that you are ready to move on to installing FiftyOne Teams.

.. code-block:: shell

	# Ensure that MongoDB is listening on port 27017 for all IPs
	netstat --listening -an | grep 27017
	# Either or both of the following mean things are just fine
	# tcp  0   0 0.0.0.0:27017   0.0.0.0:*     LISTEN
	# tcp6 0   0 :::27017        :::*          LISTEN

	# Ensure that MongoDB responds to pings
	sudo docker exec -it fiftyone_mongodb mongo \
	    --eval 'db.runCommand("ping").ok' \
	mongodb://${FIFTYONE_DB_USERNAME}:${FIFTYONE_DB_PASSWORD}@localhost --quiet
	# 1











