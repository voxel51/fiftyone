.. _enterprise-overview:

FiftyOne Enterprise Overview
============================

.. default-role:: code

FiftyOne Enterprise is purpose-built to integrate into your existing ML workflows,
including annotation, evaluation, model training, and deployment.

.. note::

    `Learn more <https://voxel51.com/enterprise>`_ about FiftyOne Enterprise and
    `contact us <https://voxel51.com/talk-to-sales>`_ to try it!

.. _fiftyone-vs-fiftyone-enterprise:

Open Source vs Enterprise
_________________________

Here's a high-level overview of the capabilities that FiftyOne Enterprise brings:

.. raw:: html

    </table><table class="table">
    <thead>
    <tr class="row-odd"><th class="head stub"></th>
    <th class="head"><p>Open Source</p></th>
    <th class="head"><p>Enterprise</p></th>
    </tr>
    </thead>
    <tbody>
    <tr class="row-even"><th class="stub"><p>Users</p></th>
    <td><p>Single</p></td>
    <td><p>Multi-user</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Deployment</p></th>
    <td><p>Local machine</p></td>
    <td><p>On-prem<br>Cloud (private or public)<br>Hybrid<br>Air-gapped<br>Multiple environments</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Storage</p></th>
    <td><p>Local filesystem</p></td>
    <td><p>Cloud or on-prem media storage<br>Data lake integrations<br>(e.g., Databricks, PostgreSQL)</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Cloud Integration</p></th>
    <td></td>
    <td><p>Native integration with<br>all major cloud providers<br>(AWS/Govcloud, GCP, Azure)</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Data Scalability</p></th>
    <td><p>Limited</p></td>
    <td><p>Scalable to 1B+ samples<br>with Data Lens</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Data Modalities</p></th>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Manual Labeling</p></th>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Auto-labeling</p></th>
    <td></td>
    <td><p>Verified auto-labeling and<br>active learning using foundational models<br>QA &amp; confidence scoring</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Data Exploration</p></th>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Data Visualization</p></th>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Vector Search</p></th>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Data Retrieval</p></th>
    <td></td>
    <td><p>Scenario search and retrieval<br>at billion+ scale from data lakes</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Data Quality</p></th>
    <td></td>
    <td><p>Automated quality scoring<br>+ workflows for poor/redundant samples</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Model Analysis</p></th>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="check" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Eval Execution</p></th>
    <td><p>Manual</p></td>
    <td><p>Built-in</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Data Encryption</p></th>
    <td><p>Users build their own<br>security practices</p></td>
    <td><p>Built-in support for encrypting<br>sensitive data at rest and in transit</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Authentication</p></th>
    <td></td>
    <td><p>SSO integration with<br>OIDC, OAuth2, SAML</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Access Controls</p></th>
    <td></td>
    <td><p>User and role-based<br>permissions</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Dataset Versioning<br>Audit Logging</p></th>
    <td></td>
    <td><p>Version datasets<br>Track, browse, and restore<br>snapshots for compliance</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Collaboration</p></th>
    <td></td>
    <td><p>Collaborate on datasets, views,<br>samples, and model performance</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Workflow Automation</p></th>
    <td><p>User implemented</p></td>
    <td><p>Built-in scheduler<br>+ orchestration integration</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>Extensibility</p></th>
    <td><p>Python SDK and plugins</p></td>
    <td><p>Plugin and panel framework<br>with custom workflows</p></td>
    </tr>
    <tr class="row-even"><th class="stub"><p>Support</p></th>
    <td><p>Community support</p></td>
    <td><p>Dedicated comms + syncs<br>Onboarding, training,<br>maintenance</p></td>
    </tr>
    <tr class="row-odd"><th class="stub"><p>License</p></th>
    <td><p>Apache 2.0</p></td>
    <td><p>Commercial license<br>with enterprise terms</p></td>
    </tr>
    </tbody>
    </table>

.. _enterprise-backwards-compatibility:

Backwards compatibility
_______________________

FiftyOne Enterprise is fully backwards compatible with FiftyOne Open Source. This
means that all of your pre-existing FiftyOne Open Source workflows should be
usable without modification.

For example, you can continue running all of the workflows listed below as you
would with FiftyOne Open Source:

.. list-table::
   :widths: 25 75
   :header-rows: 1
   :stub-columns: 1

   * - Application
     - Workflows
   * - Data ingestion
     - :ref:`Importing data into FiftyOne <importing-datasets>`
   * - Data curation
     - | :ref:`Using the FiftyOne App <fiftyone-app>`
       | :ref:`Creating views into datasets <using-views>`
       | `Embedding-based dataset analysis <https://voxel51.com/docs/fiftyone/tutorials/image_embeddings.html>`_
       | :ref:`Visual similarity <brain-similarity>` and :ref:`dataset uniqueness <brain-image-uniqueness>`
   * - Annotation
     - :ref:`Using the annotation API <fiftyone-annotation>`
   * - Model training and evaluation
     - | :ref:`Exporting data for model training <exporting-datasets>`
       | `Adding model predictions to FiftyOne <https://voxel51.com/docs/fiftyone/tutorials/evaluate_detections.html#Add-predictions-to-dataset>`_
       | :ref:`Evaluating models in FiftyOne <evaluating-models>`
       | :ref:`Using interactive plots to explore results <interactive-plots>`

.. _enterprise-system-architecture:

System architecture
___________________

FiftyOne Enterprise is implemented as a set of interoperable services, as described
in the figure below.

.. image:: /images/enterprise/enterprise_architecture.png
   :alt: enterprise-architecture
   :align: center

FiftyOne Enterprise is strictly a software offering. All relevant hardware is owned
and managed by your organization, whether on-premises or in your virtual
private cloud.

**Enterprise database services**

The primary storage location for all of the FiftyOne Enterprise datasets and related
metadata (excluding media files) for your organization.

**Enterprise web service**

An always-on front-end from which you can visually access the datasets in your
FiftyOne Enterprise deployment. Web-based access is the standard entrypoint for
non-technical users who need point-and-click access to dataset curation and
related features, as well as basic workflows for technical users. Most dataset
curation and model analysis work by engineers happens via client installations.

**Enterprise API authentication**

Technical users connecting to FiftyOne Enterprise via Python or Jupyter notebooks
use token-based authentication to make authorized connections to the
centralized database storing your Team’s dataset metadata.

**Python/notebook users (your organization)**

Similar to FiftyOne Open Source, technical users can install the FiftyOne
Enterprise client in their working environment(s). These clients are configured
to use the centralized database service and will additionally serve their own
App instances (like FiftyOne Open Source) so that engineers can work locally,
remotely, and in Jupyter notebooks.

**Web users (your organization)**

FiftyOne Enterprise provides an always-on login portal at
``https://<your-org>.fiftyone.ai`` that users can login to from any browser for
web-only workflows.

**Data lake (your organization)**

FiftyOne Enterprise does not require duplication or control over how your source
media files are stored. Instead, FiftyOne Enterprise stores references (e.g., cloud
object URLs or network storage paths) to the media in your datasets, thereby
minimizing storage costs and providing you the flexibility to provision your
object storage as you see fit. FiftyOne Enterprise has full support for cloud,
network, and local media storage.

**User authentication (your organization)**

FiftyOne Enterprise can be configured to work with your organization’s
authentication and authorization systems, enabling you to manage access to
FiftyOne Enterprise using your existing OAuth stack. FiftyOne Enterprise supports SAML
2.0 and OAuth 2.0.

.. _security-considerations:

Security considerations
_______________________

FiftyOne Enterprise relies on your organization's existing security infrastructure.
No user accounts are created specifically for FiftyOne Enterprise; we integrate
directly with your OAuth system.

Usage of the FiftyOne Enterprise client by technical users of your organization is
also secure. All database access is managed by the central authentication
service, and self-hosted App instances can be configured to only accept
connections from known servers (e.g., only localhost connections). In remote
client workflows, users are instructed how to configure ssh tunneling to
securely access self-hosted App instances.

No outside network access is required to operate FiftyOne Enterprise. Voxel51 only
requests the ability to (a) access the system logs for usage tracking and
auditing purposes, and (b) access the system at the customer’s request to
provide technical support. We are flexible in the mechanisms used to accomplish
these goals.
