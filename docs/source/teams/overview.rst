.. overview:

FiftyOne Teams overview
===========================

FiftyOne Teams is designed to integrate naturally into your ML workflow. It integrates naturally with the other components of the dataset curation and model analysis lifecycle, including annotation, evaluation, model training, and deployment.


.. _fiftyone-vs-fiftyone-teams:

FiftyOne vs FiftyOne Teams
___________________________

.. list-table::
   :widths: 16 7 7 7 7 7 7 7 7 7 7 7 7
   :header-rows: 1
   :stub-columns: 1

   * - 
     - Curate Datasets
     - Evaluate Models
     - Find Mistakes
     - Visualize Embeddings
     - Deployment
     - Dataset Management
     - User Permissions
     - Dataset Permissions
     - Dataset Versioning
     - SSO
     - Enterprise Support
     - Licensing
   * - FiftyOne
     - ☑
     - ☑
     - ☑
     - ☑
     - Local, Single user
     - ☐
     - ☐
     - ☐
     - ☐
     - ☐
     - Slack Community
     - Apache 2.0
   * - FiftyOne Teams
     - ☑
     - ☑
     - ☑
     - ☑
     - | Multi-user, on-premise,
       | private/public cloud
     - ☑
     - ☑
     - ☑
     - ☑
     - ☑
     - ☑
     - | Unlimited data, flexible
       | user-based licensing


.. _backwards-compatibility:

Backwards compatibility
__________________________

FiftyOne Teams is fully backwards compatible with open-source FiftyOne. This means that all of your pre-existing FiftyOne workflows should 
be usable without modification. Some such FiftyOne workflows are listed in the table below.

.. list-table::
   :widths: 25 75
   :header-rows: 1
   :stub-columns: 1

   * - Application
     - Workflows
   * - Data ingestion
     - `Loading data into FiftyOne <https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/index.html>`_
   * - Data curation
     - | `Using the FiftyOne App <https://voxel51.com/docs/fiftyone/user_guide/app.html>`_
       | `Creating views into datasets <https://voxel51.com/docs/fiftyone/user_guide/using_views.html>`_ 
       | `Embedding-based dataset analysis <https://voxel51.com/docs/fiftyone/tutorials/image_embeddings.html>`_
       | `Visual similarity and dataset uniqueness <https://voxel51.com/docs/fiftyone/user_guide/brain.html#cifar-10-example>`_
   * - Annotation
     - `Using the annotation API <https://voxel51.com/docs/fiftyone/user_guide/annotation.html>`_
   * - Model training and evaluation
     - | `Exporting data for model training <https://voxel51.com/docs/fiftyone/user_guide/export_datasets.html>`_
       | `Adding model predictions to FiftyOne <https://voxel51.com/docs/fiftyone/tutorials/evaluate_detections.html#Add-predictions-to-dataset>`_ 
       | `Evaluating models in FiftyOne <https://voxel51.com/docs/fiftyone/user_guide/evaluation.html>`_
       | `Using interactice plots to explore results <https://voxel51.com/docs/fiftyone/user_guide/plots.html>`_


.. _system-architecture:

System architecture
__________________________

FiftyOne Teams is implemented as a set of interoperable services, as described in the figure below. Note that FiftyOne Teams is strictly a software offering: in all cases, all relevant hardware is the responsibility of your organization, whether on-premises or in your virtual private cloud.


**Teams database services**: the primary storage location for all of the FiftyOne Teams datasets and related metadata (excluding media files) for your organization.

|

**Teams web service**: an always-on front-end from which you can visually access the datasets in your FiftyOne Teams deployment. Web-based access is the standard entrypoint for non-technical users who need point-and-click access to dataset curation and related features, as well as basic workflows for technical users. Most dataset curation and model analysis work by engineers happens via client installations.

|

**Teams API authentication**: technical users connecting to FiftyOne Teams via Python or Jupyter notebooks use token-based authentication to make authorized connections to the centralized database storing your Team’s dataset metadata.

|

**Python/notebook users (your organization)**: similar to FiftyOne, technical users can install the FiftyOne Teams client in their working environment(s). These clients are configured to use the centralized database service and will additionally serve their own App instances (like open source FiftyOne) so that engineers can work locally, remotely, and in Jupyter notebooks.

|

**Web users (your organization)**: FiftyOne Teams provides an always-on login portal at <your-company>.fiftyone.ai that users can login to from any browser for web-only workflows.

|

**Data lake (your organization)**: FiftyOne Teams does not require duplication or control over how your source media files are stored. Instead, FiftyOne Teams stores references (e.g., cloud object URLs or network storage paths) to the media in your datasets, thereby minimizing storage costs and providing you the flexibility to provision your object storage as you see fit. FiftyOne Teams has full support for cloud, network, and local media storage.

|

**User authentication (your organization)**: FiftyOne Teams can be configured to work with your organization’s authentication and authorization systems, enabling you to manage access to FiftyOne Teams using your existing OAuth stack. FiftyOne Teams supports SAML 2.0 and OAuth 2.0.

.. _security-considerations:

Security considerations
__________________________

FiftyOne Teams relies on your organization's existing security infrastructure.  No user accounts are created specifically for FiftyOne Teams; we integrate directly with your OAuth system.

Usage of the FiftyOne Teams client by technical users of your organization is also secure. All database access is managed by the central authentication service, and self-hosted App instances can be configured to only accept connections from known servers (e.g., only localhost connections). In remote client workflows, users are instructed how to configure ssh tunneling to securely access self-hosted App instances.

No outside network access is required to operate FiftyOne Teams. Voxel51 only requests the ability to (a) access the system logs for usage tracking and auditing purposes, and (b) access the system at the customer’s request to provide technical support. We are flexible in the mechanisms used to accomplish these goals.













