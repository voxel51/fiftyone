.. _install-overview:

Installation overview
======================


A FiftyOne Teams installation is composed of:

* Identity Provider(s)
* A MongoDB database
* Data Storage (e.g. cloud buckets)
* A FiftyOne Teams server
* SSL Certificates
* An SSL Endpoint with access to https://login.fiftyone.ai
* The FiftyOne Teams Authentication service (Auth0)
* FiftyOne Teams python clients on end-user systems

This guide will provide details regarding each of those components except the FiftyOne Teams python clients on end-user systems; 

FiftyOne Teams can be deployed on a wide variety of infrastructure solutions, including Kubernetes; this guide will provide general guidance for deployment of each FiftyOne Teams service.

This guide also includes specific installation instructions for setting up a single-node MongoDB instance, a single-node FiftyOne Teams server, generating Let's Encrypt SSL certificates, and using Nginx as an SSL terminator and proxy service.

Your Voxel51 Support Team can help to confirm your deployment plans and assist in configuring more complex designs.

.. note::

	FiftyOne Teams requires an SSL endpoint in order to authorize logins.  The IP associated with the DNS record does not need to be exposed to the Internet, but a HTTPS endpoint with connectivity to https://login.fiftyone.ai is required.

.. note::
	
	Obtaining SSL Certificates through Let's Encrypt requires `both port 80 and port 443 to be exposed <https://letsencrypt.org/docs/allow-port-80/>`_ to the internet for certificate renewals. You may provide your own SSL certificates instead.  In either case you will need to provide SSL Certificates for FiftyOne Teams Authentication.

	