.. _enterprise-agent:

FiftyOne Agent
==============

.. default-role:: code

.. customavailablein::
    :enterprise_version: 2.19.0

The FiftyOne Agent is an AI-powered assistant built into the
:ref:`FiftyOne Enterprise App <enterprise-app>`. It lets you work with your
datasets using natural language. You can import data, run model inference,
find duplicates, evaluate predictions, and more, all from a conversational
interface.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/voxel_agent_demo_1.webp
   :alt: fiftyone-agent-demo
   :align: center

.. _enterprise-agent-setup:

Setup
_____

1. Contact your Customer Success representative to enable the FiftyOne Agent
   for your deployment.

2. Open any dataset in the FiftyOne Enterprise App. You will see a new Agent
   button in the upper-right corner of the App.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/location_agent.webp
   :alt: fiftyone-agent-button-location
   :align: center

.. _enterprise-agent-providers:

Configuring model providers
___________________________

The first time you open the Agent, you will be prompted to configure a model
provider. The Agent supports over 100 providers, including Anthropic, OpenAI,
Google, and more.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_settings.webp
   :alt: fiftyone-agent-settings
   :align: center

To add a provider, fill in the following fields:

- **Name**: a label for this provider configuration
- **Provider**: select from the list of supported providers
- **Endpoint** (optional): use this to route requests to a custom URL, such
  as an internal enterprise gateway or a self-hosted model server
- **API key** (optional): your provider's API key. Leave this blank to use
  credentials already configured in the server environment instead, such as
  a provider's standard API key environment variable, Google Application
  Default Credentials, or an AWS instance/service role
- **Models**: select one or more models to make available
- **Custom model names** (optional): enter model identifiers that are not in
  the standard picker, such as non-standard IDs used by an enterprise gateway.
  Prefix with the provider slug (e.g. ``openai/my-model-id``) to ensure
  correct routing when the model name alone is ambiguous
- **Extra headers** (optional): static key-value HTTP headers sent with every
  request (e.g. ``User-Agent``, project tokens required by your gateway).
  When an endpoint is configured, an ``X-FiftyOne-User-Email`` header is also
  added automatically — see :ref:`Per-user attribution <enterprise-agent-custom-gateway>`
  below
- **Default**: mark this provider as the default

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/provider_more_details.webp
   :alt: fiftyone-agent-provider-details
   :align: center

You can click **Test connection** to verify your credentials before saving.

.. note::

    **Using credentials from the server environment**

    Some providers can authenticate without an API key at all, using
    credentials already available to the server. For example, if the
    deployment's runtime has Google Application Default Credentials or a
    service account with the right IAM role, a Vertex AI provider can be
    configured with the **API key** field left blank, and requests will
    authenticate using that ambient identity. The same applies to AWS
    Bedrock with an instance or service role. Click **Test connection** to
    confirm the ambient credentials resolve correctly before saving.

.. _enterprise-agent-provider-notes:

Provider-specific configuration notes
______________________________________

A few providers have configuration details worth knowing about:

- **Google Vertex AI**: model names use the ``vertex_ai/<model>`` format
  (e.g. ``vertex_ai/gemini-2.5-flash``). The GCP project is inferred from
  whichever credentials are used (an API key, or ambient credentials as
  described above), and the region defaults to ``us-central1`` (or the
  model's first supported region) — there is currently no field to
  override the region. The credential's identity needs the
  ``roles/aiplatform.user`` IAM role (or equivalent) granted on the
  project.
- **AWS Bedrock**: model names use the ``bedrock/<model-id>`` format. The
  region is read from the ``AWS_REGION`` or ``AWS_REGION_NAME``
  environment variable on the server if set, otherwise it defaults to
  ``us-west-2``. The credential's identity needs ``bedrock:InvokeModel``
  and ``bedrock:InvokeModelWithResponseStream`` permissions for the
  models you want to use.
- **Azure OpenAI**: set the **Endpoint** field to your Azure resource's
  base URL. The API version defaults to the ``AZURE_API_VERSION``
  environment variable on the server if set, otherwise a built-in default
  is used.

Use **Test connection** to confirm a provider is configured correctly for
your environment.

.. note::

    Need help configuring a provider? Contact your Customer Success
    representative, or see :ref:`Secrets <enterprise-secrets>` for how to
    store API keys securely in your deployment.

.. _enterprise-agent-custom-gateway:

Custom endpoints and enterprise gateways
_________________________________________

If your organization routes LLM traffic through an internal gateway or proxy,
you can point the Agent at it using the **Endpoint** and **Extra headers**
fields on any provider configuration.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/custom_gateway_screenshot.webp
   :alt: fiftyone-agent-custom-gateway
   :align: center

**Provider, match the API format, not the model brand**

The **Provider** field controls the request format the Agent uses, not which
model it calls. Set it to match what your gateway expects:

- If your gateway exposes an OpenAI-compatible API (``/chat/completions``),
  select ``openai``, even if the underlying model is Claude or Gemini
- If your gateway exposes the Anthropic Messages API (``/v1/messages``)
  natively, select ``anthropic``

**Endpoint, base URL only**

Enter only the base URL of your gateway — do not include the API path. The
Agent appends the correct path automatically based on the provider you
selected. For example:

.. code-block:: text

   ✓  https://gateway.internal/api/openai/v1
   ✗  https://gateway.internal/api/openai/v1/chat/completions

**Model names, always prefix with the provider slug**

Use the model identifier your gateway provides, prefixed with the provider
slug. The prefix prevents the model ID from being misrouted to a cloud
provider instead of your gateway, and is stripped before the name is sent:

.. code-block:: text

   openai/your-model-id
   anthropic/your-model-id

This is especially important when your gateway returns model IDs that start
with a vendor name (e.g. ``anthropic.claude-sonnet``). Without the prefix,
those IDs may be misrouted to a cloud provider instead of your gateway.

Use **Test connection** to verify the full configuration works before saving.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/custom_gateway_headers_screenshot.webp
   :alt: fiftyone-agent-extra-headers
   :align: center

Use **Extra headers** for any additional authentication or routing headers your
gateway requires, such as project tokens or custom ``User-Agent`` values.

**Per-user attribution**

When a custom endpoint is configured, the Agent automatically adds an
``X-FiftyOne-User-Email`` header to every request containing the email address
of the currently logged-in user. Gateways can use this header to attribute
requests to individual users rather than a shared system account, which is
useful for enforcing per-user quotas or audit logging.

.. note::

    Admins are responsible for ensuring that the configured endpoint's data
    handling and retention align with their organization's privacy policy.

.. _enterprise-agent-using:

Using the agent
_______________

Once a provider is configured, you can start a conversation with the Agent.
Type any task in plain language and the Agent will execute it against your
dataset.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_chat.webp
   :alt: fiftyone-agent-chat
   :align: center

Some examples of what you can ask:

- *"Find and remove duplicate images from this dataset"*
- *"Run object detection and show me low-confidence predictions"*
- *"Export this dataset to COCO format"*

To start a new conversation, click the **+** button.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/new_conversation.webp
   :alt: fiftyone-agent-new-conversation
   :align: center

To return to a previous conversation, click **History**.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/conversation_history.webp
   :alt: fiftyone-agent-conversation-history
   :align: center

.. _enterprise-agent-skills:

Skills
______

The Agent ships with a set of built-in skills that cover the most common
computer vision workflows. Skills are structured instructions that tell the
agent exactly how to perform a task, step by step.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/skills.webp
   :alt: fiftyone-agent-skills
   :align: center

.. note::

    You can also build and add your own custom skills to extend the agent's
    capabilities. See :ref:`Developing skills <agents-developing>` for full
    instructions.

.. customanimatedcta::
    :button_text: Browse Enterprise Skills
    :button_link: ../agents/index.html?tag=Enterprise
    :align: right
