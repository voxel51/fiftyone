.. _teams-and-mongo:

FiftyOne Teams and MongoDB
==========================

.. default-role:: code

You can choose to run your MongoDB and FiftyOne Teams infrastructure on a wide variety of platforms and configurations.  You will need to decide, based on your team's use of FiftyOne Teams, how to balance the cost of high-availability and your own availability requirements.

This guide details the steps for using Google Cloud to deploy a single MongoDB node and a single FiftyOne Teams node with Let's Encrypt SSL certificates and Nginx for SSL termination.  Using this simple pattern it is possible to design deployments that leverage MongoDB clusters, MongoDB Atlas, and multiple FiftyOne Teams nodes behind a load balancer.

Your Voxel51 Support Team is available to validate any deployment strategies you may wish to pursue.
