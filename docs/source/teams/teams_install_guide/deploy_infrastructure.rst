.. _deploy-infrastructure:

Deploying Infrastructure
==========================

.. default-role:: code


For performance reasons, it is recommended that you deploy your MongoDB database and your FiftyOne Teams application on separate server instances, and that MongoDB database data is stored on an `XFS filesystem <https://www.mongodb.com/docs/v4.4/administration/production-notes/#kernel-and-file-systems>`_.

For a team of up to 10 users, it is recommended that MongoDB be deployed on a system with at least 64 GB of RAM and 16 vCPUs available.  Details regarding this recommendation can be found in the FiftyOne Teams Database Cost Analysis distributed with this guide.

For a team of up to 10 users, it is recommended that FiftyOne Teams be deployed on a system with at least 16 GB of RAM and 4 vCPUs available.  FiftyOne Teams should be scaled by adding additional nodes to a load balancer or reverse proxy configuration to spread the load between multiple systems.

Your Voxel51 Support Team can provide you with terraform, and instructions, to provision infrastructure for a standalone MongoDB deployment and a standalone FiftyOne Teams instance using Google Cloud. Please contact your Voxel51 Support Team if you would like us to send you the terraform module.
