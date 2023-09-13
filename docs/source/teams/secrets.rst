.. _teams-secrets:

FiftyOne Teams Secret Management
================================

.. default-role:: code

Secrets enable storing sensitive information such as API tokens and login
credentials in a secure
manner. You can add, configure, and remove secrets in the FiftyOne Teams App
by navigating to the Secrets Management page under Settings > Secrets.

.. note::

    Only Admins have access to the secrets management page. However, once
    added, any App component or feature requiring secret values can
    access them via the :class:`SecretManager <fiftyone.internal.secrets.manager>`

.. image:: /images/teams/secrets_page.png
   :alt: teams-secrets-page
   :align: center

What is a Secret?
-----------------
Secret keys are strings in upper snake case (e.g. `MY_SECRET_KEY`) used to
identify a secret.
Secret values are stored encrypted in the database
and only decrypted at runtime on the client if and only if the
client configured as
an internal service.


Why use Secrets?
----------------
Not only does it provide an extra layer of security for storing and sharing
private information, managing secrets through the App is a straightforward
way to configure connections to and integrations with
external services and APIs such as GCP, OpenAI, CVAT, etc. Instead of
changing the configuration or environment variables of the container in
which your teams FiftyOne App is running, you can simply add or remove
them from the UI while the app is running. This can be especially useful for
running :ref:`plugin operators<fiftyone-operators>` that
require secrets.
