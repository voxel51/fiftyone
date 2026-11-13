.. _enterprise-management-sdk:

Enterprise Management SDK
=========================

.. default-role:: code

One of FiftyOne's core design principles is that you should be able to do
everything *programmatically* if you want.

To this end, the `fiftyone.management` module provides Enterprise-specific
methods for managing users, invitations, dataset permissions, plugins, API
keys, audit logs, and more.

.. note::

   You must use an :ref:`API connection <enterprise-api-connection>`
   (not a direct MongoDB connection) in order to use Management SDK methods.

.. _enterprise-sdk-api-reference:

API reference
-----------

.. _enterprise-sdk-connections:

Connections
-----------

.. autoapimodule:: fiftyone.management.connection
   :members: test_api_connection, reload_connection

.. _enterprise-sdk-api-keys:

API keys
--------

.. autoapimodule:: fiftyone.management.api_key
   :members:
   :undoc-members:

.. _enterprise-sdk-audit-log:

Audit log and activity history
------------------------------

The audit log is the organization-wide record of who did what. You can list,
summarize, and export it programmatically, and you can read the activity
history of an individual sample or label.

.. note::

   Only admins can access the audit log. Reading a sample's activity history
   requires view access to its dataset. These methods require that activity
   tracking is enabled for your deployment.

.. code-block:: python

   import datetime

   import fiftyone.management as fom

   # The event types that the audit log can be filtered by
   for event_type in fom.list_audit_event_types():
       print(event_type.event_type, event_type.description)

   # The 100 most recent events
   events = fom.list_audit_events()

   # Every dataset deletion in the past week
   since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
       days=7
   )
   events = fom.list_audit_events(
       event_type="dataset.deleted", since=since, limit=None
   )

   # Everything a given user did in a dataset
   events = fom.list_audit_events(
       actor="user@company.com", dataset_name="quickstart"
   )

   # Read a large time range without holding every event in memory
   for event in fom.iter_audit_events(since=since):
       print(event.timestamp, event.actor, event.event_type)

   # A summary that groups bursts of related events into sentences
   for item in fom.get_audit_summary(dataset_name="quickstart"):
       print(item.ended, item.text)

   # Export the audit log to a CSV file
   fom.export_audit_log("/tmp/audit.csv", since=since)

The activity history of a sample, or of a single label, can be retrieved by
anyone with view access to the dataset:

.. code-block:: python

   import fiftyone as fo
   import fiftyone.management as fom

   dataset = fo.load_dataset("quickstart")
   sample = dataset.first()

   # A sample's history
   events = fom.list_sample_activity("quickstart", sample_id=sample.id)

   # One label's history
   events = fom.list_sample_activity(
       "quickstart",
       label_id=sample.ground_truth.detections[0].id,
   )

.. autoapimodule:: fiftyone.management.audit
   :members: AuditEvent, AuditEventType, AuditSummaryItem,
       list_audit_event_types, list_audit_events, iter_audit_events,
       get_audit_summary, export_audit_log, list_sample_activity,
       iter_sample_activity

.. _enterprise-sdk-cloud-credentials:

Cloud credentials
-----------------

.. autoapimodule:: fiftyone.management.cloud_credentials
   :members:
   :undoc-members:

.. _enterprise-sdk-dataset-permissions:

Dataset permissions
-------------------

.. customavailablein::
    :enterprise_version: 1.3.0

.. autoapimodule:: fiftyone.management.dataset
   :members:
   :undoc-members:

.. _enterprise-sdk-organization-settings:

Organization settings
---------------------

.. autoapimodule:: fiftyone.management.organization
   :members:
   :undoc-members:

.. _enterprise-sdk-plugin-management:

Plugin management
-----------------

.. autoapimodule:: fiftyone.management.plugin
   :members:
   :undoc-members:

.. _enterprise-sdk-orchestrator-management:

Orchestrator management
-----------------------

.. customavailablein::
    :enterprise_version: 2.10.0

.. autoapimodule:: fiftyone.management.orchestrator
   :members:
   :undoc-members:

.. _enterprise-sdk-secrets:

Secrets
-------

.. customavailablein::
    :enterprise_version: 2.10.0

.. autoapimodule:: fiftyone.management.secret
   :members:
   :undoc-members:

.. _enterprise-sdk-snapshots:

Snapshots
---------

.. autoapimodule:: fiftyone.management.snapshot
   :members:
   :undoc-members:

.. _enterprise-sdk-service-account-management:

Service account management
--------------------------

Service accounts can be managed programmatically using the SDK. For an
overview of service accounts, their roles, and UI management, see
:ref:`Service accounts <enterprise-service-accounts>`.

.. code-block:: python

   import fiftyone.management as fom

   # Create a service account
   sa = fom.create_service_account("my-pipeline-bot", fom.MEMBER)
   print(sa.id)

   # List all service accounts
   service_accounts = fom.list_service_accounts()

   # Retrieve a specific service account by ID
   sa = fom.get_service_account(sa.id)

   # Update a service account's name, role, or description
   fom.update_service_account(
       sa, role=fom.COLLABORATOR, description="Automation bot for dataset tasks"
   )

   # Delete a service account (irreversible)
   fom.delete_service_account(sa)

API keys can be generated, listed, and deleted for service accounts:

.. code-block:: python

   import fiftyone.management as fom

   sa = fom.get_service_account("some-id")

   # Generate an API key for the service account
   key = fom.generate_api_key("pipeline-key", sa)

   # List all keys for a service account
   keys = fom.list_api_keys(sa)

   # Delete a specific key
   fom.delete_api_key(keys[0].id, sa)

.. autoapimodule:: fiftyone.management.service_account
   :members:
   :undoc-members:

.. _enterprise-sdk-user-management:

User management
---------------

.. customavailablein::
    :enterprise_version: 1.3.0

.. autoapimodule:: fiftyone.management.users
   :members:
   :undoc-members:

.. _enterprise-sdk-group-management:

Group management
----------------

.. customavailablein::
    :enterprise_version: 2.0.0

.. autoapimodule:: fiftyone.management.user_groups
   :members:
   :undoc-members:

.. _enterprise-sdk-workflow-assignment:

Workflow task assignment
------------------------

.. autoapimodule:: fiftyone.management.workflows
   :members:
   :undoc-members:
