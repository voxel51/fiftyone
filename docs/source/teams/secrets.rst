.. _teams-secrets:

FiftyOne Teams Secret Management
================================

.. default-role:: code

Secrets enable storing sensitive information such as API tokens and login
credentials in a secure
manner. You can add, configure, and remove secrets in the FiftyOne Teams App
by navigating to the Secrets Management page under Settings > Secrets.

.. image:: /images/teams/secrets_page.png
   :alt: teams-secrets-page
   :align: center

.. note::

    Only Admins have access to the secrets management page. However, once
    added, any App component or feature requiring secret values can
    access them via the `SecretManager` interface.

What is a Secret?
-----------------
When you tap on the `+ Add secret` button,you will see that a secret is
comprised of a key, value, and description.

.. image:: /images/teams/create_secret_form.png
   :alt: teams-create-secret-form
   :align: center

-  Secret keys are strings in upper snake case (e.g. `MY_SECRET_KEY`) used
   to identify a :doc:`secret <../api/fiftyone.internal.secrets>`.
-  Secret values are stored encrypted in the database
   and only decrypted at runtime on the client if and only if the
   client is configured as an internal service.


Why use Secrets?
----------------
Not only does it provide an extra layer of security for storing and sharing
private information, managing secrets through the App is a straightforward
way to configure connections to and integrations with
external services and APIs such as GCP, OpenAI, CVAT, etc. Instead of
changing the configuration or environment variables of your FiftyOne Teams 
containers and restarting them, you can simply add or remove
secrets using the UI with the FiftyOne Teams App running. This can be especially useful for
running :ref:`plugin operators<fiftyone-operators>` that require secrets.
