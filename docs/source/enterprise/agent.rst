.. _enterprise-agent:

FiftyOne Agent
==============

.. default-role:: code

.. customavailablein::
    :enterprise_version: 2.25.0

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

.. note::

    The FiftyOne Agent now ships as a built-in feature of the FiftyOne
    Enterprise App rather than a separately installed plugin. If you
    installed an earlier standalone version of the Agent plugin, you can
    remove it once your deployment is upgraded. The built-in version
    replaces it entirely.

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
- **API key**: your provider's API key
- **Models**: select one or more models to make available
- **Custom model names** (optional): enter model identifiers that are not in
  the standard picker, such as non-standard IDs used by an enterprise gateway.
  Prefix with the provider slug (e.g. ``openai/my-model-id``) to ensure
  correct routing when the model name alone is ambiguous
- **Extra headers** (optional): static key-value HTTP headers sent with every
  request (e.g. ``User-Agent``, project tokens required by your gateway)

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/provider_more_details.webp
   :alt: fiftyone-agent-provider-details
   :align: center

You can click **Test connection** to verify your credentials before saving.

To choose which model new users start with, use the **Default model** picker
at the top of the Connections list.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_default_model.webp
   :alt: fiftyone-agent-default-model
   :align: center

.. note::

    API keys are automatically stored securely using FiftyOne
    Enterprise's :ref:`Secrets <enterprise-secrets>` infrastructure. No
    manual secret configuration is required.

.. _enterprise-agent-permissions:

Permissions
___________

Any user who can view a dataset can chat with the Agent and ask it to take
action on that dataset. A few capabilities require additional permissions:

- **Managing connections** (adding, editing, or removing a model provider,
  or changing the default model) requires the Admin role.
- **Generating and testing plugins** with the Agent requires the Admin role.

.. image:: https://cdn.voxel51.com/fiftyone-internal-skills/develop_plugin.webp
   :alt: fiftyone-agent-develop-plugin
   :align: center

- **Generating and executing SDK code** with the Agent requires a role with
  API key access enabled. See :ref:`Roles and permissions
  <enterprise-roles>` for which roles support this by default and how to
  change it.

.. image:: https://cdn.voxel51.com/fiftyone-internal-skills/write_code.webp
   :alt: fiftyone-agent-write-code
   :align: center

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

.. _enterprise-agent-instructions:

Custom instructions
____________________

You can give the Agent standing instructions that are automatically included
in every conversation, at three scopes:

- **Organization**: written by an admin, applied to every conversation for
  every user in the deployment
- **User**: personal instructions that apply only to your own conversations
- **Dataset**: shared instructions that apply to every conversation involving
  a specific dataset, for everyone with access to it

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_instructions.webp
   :alt: fiftyone-agent-instructions
   :align: center

Configure instructions from the Agent's settings panel.

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

.. _enterprise-agent-screenshot:

Asking about the current App state
___________________________________

Click the screenshot icon next to the attach icon in the message box to
capture what's currently on screen and attach it to your next message.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_screenshot_location.webp
   :alt: fiftyone-agent-screenshot-location
   :align: center

This lets you ask the Agent about exactly what you're looking at, such as a
specific sample, a plot, or a 3D scene, without describing it in words. Your
browser will prompt you to choose what to share before the screenshot is
attached.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_screenshot.webp
   :alt: fiftyone-agent-screenshot
   :align: center

If you select one or more samples in the grid first, an additional icon lets
you attach their images directly, so you can ask the Agent about specific
samples without describing or searching for them in words. Up to 20 samples
can be attached at once; if more are selected, only the first 20 are
attached.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_attach_samples.webp
   :alt: fiftyone-agent-attach-samples
   :align: center

.. _enterprise-agent-workspace:

Returning to a previous view
_____________________________

Whenever the Agent changes what you're looking at, such as applying a
filter, loading a view, or running an operator, that step gets a
**Load Workspace** button. Click it any time, even after navigating away, to
instantly restore the App to that exact state.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_load_workspace_location.webp
   :alt: fiftyone-agent-load-workspace-location
   :align: center

.. _enterprise-agent-delegated-ops:

Tracking delegated operations
______________________________

When the Agent runs a long-running task as a :ref:`delegated operation
<enterprise-delegated-operations>`, it appears in a tray showing how many are
queued, running, completed, and failed, so you can keep chatting while it
runs in the background.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_delegated_ops.webp
   :alt: fiftyone-agent-delegated-ops
   :align: center

Click a job in the tray to see its own progress and details.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_delegated_ops_detail.webp
   :alt: fiftyone-agent-delegated-ops-detail
   :align: center

.. _enterprise-agent-usage:

Usage
_____

The Agent's settings panel includes a Usage tab showing your own token and
request counts for the current period. Admins additionally see usage totals
for the entire organization.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/agent_usage.webp
   :alt: fiftyone-agent-usage
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

Open any skill to read its full definition: the description that tells the
Agent when to use it, and the step-by-step instructions it follows. Built-in
skills are read-only, so you can always see exactly what the Agent was told
to do.

Use the toggle on each skill to control which ones the Agent may use. Turning
a skill off removes it from the Agent's options without deleting anything.

.. _enterprise-agent-skills-editing:

Creating and editing skills
___________________________

Admins can extend the Agent with their own skills, directly from the settings
panel. No plugin packaging or deployment step is required.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/skill_editor.webp
   :alt: fiftyone-agent-skill-editor
   :align: center

Click **Create skill** to write a new one. Every skill needs three things:

- **Name**: lowercase and dash-separated, e.g. ``triage-blurry-images``
- **Description**: when the Agent should reach for this skill. This is the
  only thing the Agent sees when choosing between skills, so write it as
  *when to use this*, not *what this is*
- **Instructions**: the workflow itself, in Markdown, covering what to check
  first, which operators to call, and the steps to follow

To adapt a built-in skill, open it and click **Duplicate**. This gives you an
editable copy, leaving the original untouched. The copy needs its own name and
its own description: two skills that describe themselves the same way make the
Agent's choice between them arbitrary.

Once your copy is saved, switch the built-in skill **off** using its toggle.
The Agent then uses your version instead, and you keep the original in place
to turn back on or duplicate again later.

.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/skills.webp
   :alt: fiftyone-agent-skill-toggle
   :align: center

.. note::

    Custom skills are stored as a plugin in your deployment, so they can be
    downloaded and shared like any other plugin. See
    :ref:`Developing skills <agents-developing>` if you would rather author
    them as files.

.. _enterprise-agent-skills-ask:

Asking the Agent to write a skill
_________________________________

You can also ask the Agent to write or improve a skill for you, for example
*"turn the steps we just worked through into a skill"* or *"add a validation
step to my triage skill"*.


.. image:: https://cdn.voxel51.com/voxel-agent/enterprise/skill_agent_authored.webp
   :alt: fiftyone-agent-skill-toggle
   :align: center

The Agent never writes a skill on its own. It proposes the change in a review
card showing exactly what would be added and removed, line by line, against
the current version. Nothing is saved until you click **Approve**, and
rejecting leaves the skill exactly as it was.

Built-in skills stay protected here too: if you ask the Agent to change one,
it will propose a copy instead of modifying the original.

.. customanimatedcta::
    :button_text: Browse Enterprise Skills
    :button_link: ../agents/index.html?tag=Enterprise
    :align: right
