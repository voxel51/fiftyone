.. _enterprise-overview:

FiftyOne Enterprise Overview
============================

.. default-role:: code

.. meta::
    :description: FiftyOne Enterprise adds collaboration, roles and permissions, auto-labeling, dataset versioning, and billion-scale data access on top of FiftyOne Open Source.

.. title:: FiftyOne Enterprise vs Open Source

FiftyOne Enterprise is the commercial edition of FiftyOne, the open source
multimodal data platform for physical AI. It adds the collaboration, governance,
automation, and scale that teams need to curate, evaluate, and ship production AI
systems, while remaining fully compatible with your existing open source
workflows.

.. note::

    `Learn more <https://voxel51.com/fiftyone/why-upgrade>`_ about FiftyOne Enterprise and
    `contact us <https://voxel51.com/talk-to-sales>`_ to try it!

A few of the capabilities that FiftyOne Enterprise adds on top of the open
source project:

.. grid:: 1 2 3 3
    :gutter: 3

    .. grid-item-card:: Multi-user collaboration & governance
        :link: roles_and_permissions
        :link-type: doc

        Roles, permissions, SSO, and service accounts for secure collaboration
        on datasets, views, samples, and model results.

    .. grid-item-card:: Cloud-backed media & billion-scale
        :link: cloud_media
        :link-type: doc

        Reference media in the cloud without copying it, and scale to billions
        of samples across your datasets and connected data lakes.

    .. grid-item-card:: Automation & scalable compute
        :link: plugins.html#delegated-operations
        :link-type: url

        A built-in orchestrator schedules and monitors background jobs on your
        compute, scaling horizontally to as many workers as you need.

    .. grid-item-card:: Data Lens
        :link: data_lens
        :link-type: doc

        Search, preview, and import samples from your data lakes and external
        sources at billion-scale.

    .. grid-item-card:: Auto-Labeling
        :link: verified_auto_labeling
        :link-type: doc

        Pre-label data with foundation and zoo models, then verify it with
        built-in QA workflows.

    .. grid-item-card:: FiftyOne Agent __SUB_NEW__
        :link: agent
        :link-type: doc

        Work with your datasets in natural language — import data, run
        models, and evaluate predictions from a conversational interface.

.. _fiftyone-vs-fiftyone-enterprise:

Open Source vs Enterprise
_________________________

Here's how FiftyOne Enterprise compares to FiftyOne Open Source. Follow the
links in each row for details.

.. raw:: html

    <style>
    .fo-compare th.stub, .fo-compare td { text-align: left; vertical-align: top; }
    .fo-compare th.stub { font-weight: 600; }
    .fo-compare td p, .fo-compare th.stub p { margin: 0.2rem 0; }
    .fo-compare tr.cat th {
        padding: 22px 0 6px;
        font-size: 1.05rem;
        font-weight: 700;
        border-bottom: 2px solid var(--pst-color-primary);
    }
    .fo-compare .none { color: var(--pst-color-text-muted); }
    .table.fo-compare .check-icon {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        justify-content: center;
        margin-top: 0;
    }
    .table.fo-compare .check-icon img {
        height: 11px;
        width: 11px;
        margin: 0;
    }
    </style>
    <table class="table fo-compare">
    <thead>
    <tr>
    <th class="head stub" style="width:38%"></th>
    <th class="head" style="width:31%"><p>FiftyOne Open Source</p></th>
    <th class="head" style="width:31%"><p>FiftyOne Enterprise</p></th>
    </tr>
    </thead>
    <tbody>

    <tr class="cat"><th colspan="3">Users &amp; access</th></tr>
    <tr>
    <th class="stub"><p><a href="roles_and_permissions.html">Users supported</a></p></th>
    <td><p>Single user</p></td>
    <td><p>Multiple users</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="app.html">Multi-user collaboration</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Collaborate on datasets, views, samples, and model results</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="roles_and_permissions.html">Roles &amp; permissions</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Admin, Member, Collaborator, Labeler, and Guest roles, plus user groups and service accounts</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="pluggable_auth.html">Authentication &amp; SSO</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Single sign-on via OIDC, OAuth2, and SAML</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Deployment</th></tr>
    <tr>
    <th class="stub"><p><a href="installation.html">Deployment options</a></p></th>
    <td><p>Local machine</p></td>
    <td><p>On-prem, air-gapped, private/public cloud, and hybrid</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="installation.html">Multiple environments</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Separate production and staging deployments</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Dataset support &amp; data access</th></tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/groups.html">Multimodal data</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="cloud_media.html">Media storage</a></p></th>
    <td><p>Local filesystem</p></td>
    <td><p>Cloud-backed media references (no duplication)</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="cloud_media.html">Cloud providers</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Amazon S3, Google Cloud Storage, Azure, and MinIO / S3-compatible stores</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="data_lens.html">Data lake integrations</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Databricks, BigQuery, PostgreSQL, and custom sources via Data Lens</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="query_performance.html">Scale</a></p></th>
    <td><p>Limited by local resources</p></td>
    <td><p>Billions of samples across your datasets and connected data lakes, with indexing and summary fields for fast queries</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Data governance &amp; security</th></tr>
    <tr>
    <th class="stub"><p><a href="secrets.html">Encryption &amp; secrets</a></p></th>
    <td><p>Self-managed</p></td>
    <td><p>Encrypted secrets management that integrates with your security infrastructure</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="dataset_versioning.html">Dataset versioning &amp; audit</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Immutable snapshots you can browse, load, restore, and archive</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="roles_and_permissions.html#enterprise-permissions">Access control</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Per-dataset, per-operator, and per-agent permissions</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Automation</th></tr>
    <tr>
    <th class="stub"><p><a href="plugins.html#delegated-operations">Workflow automation</a></p></th>
    <td><p>Run background jobs locally at your machine's scale</p></td>
    <td><p>Built-in orchestrator schedules and monitors background jobs on connected compute, scaling horizontally to as many workers as you need and integrating with your existing orchestration tools</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="agent.html">FiftyOne Agent</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>AI assistant built into the App for natural-language dataset workflows</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Data workflows</th></tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/app.html">Visualize &amp; explore</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="../brain.html">Embeddings &amp; similarity</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/annotation.html">In-App annotation</a></p></th>
    <td><p>Built-in: schemas, ontologies, and AI-assisted segmentation</p></td>
    <td><p>Adds Labeler role, schema permissions, custom segmentation models, and an annotation workflow builder with project management</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="verified_auto_labeling.html">Auto-labeling &amp; QA</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Auto-label with foundation and zoo models, with confidence scoring and verified review</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="data_quality.html">Data quality</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Built-in scans for blur, brightness, aspect ratio, entropy, and duplicates</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="data_lens.html">Data retrieval at scale</a></p></th>
    <td><p class="none">Not available</p></td>
    <td><p>Search and import from external sources and data lakes via Data Lens</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Model workflows</th></tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/evaluation.html">Model evaluation</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/app.html#app-model-evaluation-panel">Model comparison</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/app.html#app-scenario-analysis">Scenario &amp; subset analysis</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="../user_guide/app.html#app-model-evaluation-panel">Sample-level analysis</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="plugins.html#delegated-operations">Evaluation execution</a></p></th>
    <td><p>Manual / local</p></td>
    <td><p>Scheduled on connected compute</p></td>
    </tr>

    <tr class="cat"><th colspan="3">Customization &amp; extensibility</th></tr>
    <tr>
    <th class="stub"><p><a href="plugins.html">Plugins &amp; panels</a></p></th>
    <td><p>Python SDK and plugins</p></td>
    <td><p>Shared, permissioned plugins and panels, with distributed execution</p></td>
    </tr>
    <tr>
    <th class="stub"><p><a href="plugins.html">Custom dashboards</a></p></th>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    <td><div class="check-icon"><img alt="Included" src="/_static/images/icons/checkmark.svg" /></div></td>
    </tr>

    <tr class="cat"><th colspan="3">Support &amp; licensing</th></tr>
    <tr>
    <th class="stub"><p>Support</p></th>
    <td><p>Community support</p></td>
    <td><p>Dedicated enterprise support and onboarding, with guidance on upgrades and maintenance</p></td>
    </tr>
    <tr>
    <th class="stub"><p>Licensing</p></th>
    <td><p>Apache 2.0</p></td>
    <td><p>Commercial license with unlimited data and flexible user-based pricing</p></td>
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
       | :doc:`Embedding-based dataset analysis </tutorials/image_embeddings>`
       | :ref:`Visual similarity <brain-similarity>` and :ref:`dataset uniqueness <brain-image-uniqueness>`
   * - Annotation
     - | :ref:`In-App annotation <in-app-annotation>`
       | :ref:`Using the annotation API <fiftyone-annotation>`
   * - Model training and evaluation
     - | :ref:`Exporting data for model training <exporting-datasets>`
       | :doc:`Adding model predictions to FiftyOne </tutorials/evaluate_detections>`
       | :ref:`Evaluating models in FiftyOne <evaluating-models>`
       | :ref:`Using interactive plots to explore results <interactive-plots>`

.. _security-considerations:

Security considerations
_______________________

FiftyOne Enterprise is strictly a software offering that runs entirely within
your own infrastructure — on-premises, in your virtual private cloud, or in a
fully air-gapped environment with no outbound internet access. All hardware and
data are owned and managed by your organization.

Because the platform is self-hosted, Voxel51 has no access to your data,
datasets, or deployment. FiftyOne Enterprise integrates with your organization's
existing security infrastructure: users authenticate through your identity
provider using OIDC, OAuth2, or SAML — see
:ref:`Pluggable Authentication <pluggable-auth>` for the supported
authentication modes — and all database access is brokered by the central
authentication service.

When deployed with :ref:`internal authentication mode <pluggable-auth>`, no
outside network access is required to operate FiftyOne Enterprise, making it
suitable for air-gapped and other high-security environments.
