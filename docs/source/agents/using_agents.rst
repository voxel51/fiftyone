
.. _agents-using-agents:

Using Agents
============

.. default-role:: code

.. meta::
    :description: How to connect AI assistants to a Voxel51 deployment
        using the agent gateway (MCP) and FiftyOne Skills, authenticated
        as yourself with your own account permissions.

.. customavailablein::
    :enterprise_version: 2.26.0

.. note::

    Remote agent access is a Voxel51 feature and must be explicitly enabled
    by your deployment's administrator (it ships behind a feature flag, off
    by default). If it's not enabled yet, ask your FiftyOne admin.

.. _using-agents-overview:

What Are Skills and MCP?
________________________

Skills and MCP solve different parts of the same problem. MCP is about
connection: it lets an agent talk to real systems, run real operations, and
get real results instead of just generating text. Skills are about guidance:
they teach the agent how to use those capabilities correctly for a specific
task. MCP exposes what the system can do, while skills explain how and when
to do it.

On their own, tools are powerful but ambiguous. Skills turn those tools into
repeatable workflows. They encode experience, decisions, and guardrails.
Together, they let agents move from *"I can call functions"* to *"I know how
to complete this task end to end."*

Two Parts, One System
---------------------

**The agent gateway** connects an agent directly to your Voxel51 deployment
over the open `Model Context Protocol <https://modelcontextprotocol.io>`_
standard. You authenticate as yourself, through a one-time browser approval,
so the agent acts with exactly your own role and dataset permissions, no
separate service account or shared credential involved.

**FiftyOne Skills** are expert workflows built on top. Each skill teaches the
agent how to complete a specific task: import data, find duplicates, visualize
embeddings. Skills handle the nuances so you don't have to.

.. _using-agents-quickstart:

Quick Start
___________

.. _using-agents-step1:

Step 1: Install the Skill
---------------------------

The fastest path: install the skill and let it handle the rest, including
asking you for your deployment's URL and walking you through the one-time
browser approval.

.. code-block:: bash

    curl -fsSL https://skil.sh | sh -s -- voxel51/fiftyone-skills

When prompted, select **voxel51-agent-setup**. Then just ask your agent:

.. code-block:: prompt

    "Connect my agent to our Voxel51 deployment"

See the :ref:`Agent Ecosystem <agents-skills>` for the full list of
available skills, or :ref:`develop your own <developing-skills-authoring>`.

.. _using-agents-step2:

Step 2: Manual Configuration (optional)
------------------------------------------

Prefer to configure it yourself, without installing the skill? Add the
gateway as a remote MCP server using your deployment's gateway URL:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Deployment
     - Gateway URL
   * - Voxel51 Cloud
     - ``https://app.voxel51.com/api/proxy/fiftyone-teams/mcp``
   * - Self-hosted Voxel51
     - ``https://<your-deployment>/api/proxy/fiftyone-teams/mcp`` (ask your
       admin for ``<your-deployment>``)

Substitute whichever applies in the examples below.

.. tabs::

   .. tab:: Claude Code

      .. code-block:: bash

          claude mcp add --transport http --scope user voxel51-agent-gateway \
            https://<your-deployment>/api/proxy/fiftyone-teams/mcp \
            --client-id voxel51-agent-mcp

   .. tab:: Claude Desktop

      Remote servers are added through the Connectors UI, not
      ``claude_desktop_config.json`` (that file is for local servers only):

      1. Go to **Settings > Connectors**.
      2. Click **Add**, then **Add custom connector**.
      3. Enter a name and the gateway URL.
      4. Under **OAuth client**, choose **Use your own OAuth client** (not
         *Register automatically*, which attempts Dynamic Client
         Registration and fails against this deployment) and enter
         ``voxel51-agent-mcp``.
      5. Click **Add**, then sign in when prompted.

   .. tab:: Cursor

      Add to ``~/.cursor/mcp.json`` (global) or ``.cursor/mcp.json``
      (project-scoped):

      .. code-block:: json

          {
            "mcpServers": {
              "voxel51-agent-gateway": {
                "url": "https://<your-deployment>/api/proxy/fiftyone-teams/mcp",
                "auth": {
                  "CLIENT_ID": "voxel51-agent-mcp"
                }
              }
            }
          }

   .. tab:: VS Code

      Add to ``.vscode/mcp.json``:

      .. code-block:: json

          {
            "servers": {
              "voxel51-agent-gateway": {
                "type": "http",
                "url": "https://<your-deployment>/api/proxy/fiftyone-teams/mcp",
                "oauth": {
                  "clientId": "voxel51-agent-mcp"
                }
              }
            }
          }

   .. tab:: GitHub Copilot

      Add to ``.vscode/mcp.json`` in your workspace (create if it doesn't
      exist), same shape as the VS Code tab (including the ``oauth``
      block), then enable **Agent mode** in Copilot Chat.

.. important::

    The ``--client-id`` (or equivalent) is required: this deployment's auth
    server doesn't support Dynamic Client Registration, so a client that
    tries to register one on its own fails with
    ``Incompatible auth server: does not support dynamic client
    registration``. ``voxel51-agent-mcp`` is the fixed client id every agent
    uses. If your client's config format has no way to pin a client id and
    hits that error, install the skill instead (Step 1), which also offers
    a CLI-based fallback (``fiftyone agent login``).

Restart your agent after adding the server; new MCP servers only attach on
the next session. Then trigger the connection (e.g. by trying to use one of
the new tools): your agent opens a browser for a one-time OAuth consent
screen. Sign in and approve, no API key needed.

.. _using-agents-step3:

Step 3: Use It
---------------

.. code-block:: prompt

    "List the FiftyOne operators I can run"
    "Run the duplicate-detection operator on my quickstart dataset"
    "Evaluate my model's predictions and summarize the results"
    "Check the status of my last background run"

Your agent discovers the operators your account is permitted to run, live
on every call, and executes the appropriate tools.

.. _using-agents-tools:

Available Tools
_______________

.. list-table::
   :widths: 25 75
   :header-rows: 1

   * - Tool
     - Description
   * - ``list_operators``
     - List the operators you currently have permission to run
   * - ``get_operator_schema``
     - Get one operator's input schema before running it
   * - ``execute_operator``
     - Run an operator, optionally in the background (``delegate=True``)
   * - ``list_delegated_operations``
     - List your own background runs and their status
   * - ``get_delegated_operation``
     - Check on one background run's status and, once complete, its outcome

.. _using-agents-resources:

Resources
_________

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Resource
     - Description
   * - `FiftyOne Skills <https://github.com/voxel51/fiftyone-skills>`_
     - Expert workflows for AI assistants, including ``voxel51-agent-setup``
   * - `FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_
     - Official plugin collection
   * - `Model Context Protocol <https://modelcontextprotocol.io>`_
     - MCP specification
   * - `Voxel51 documentation <https://docs.voxel51.com/enterprise/index.html>`_
     - Voxel51 Cloud and self-hosted deployment docs
   * - `Discord Community <https://discord.gg/fiftyone-community>`_
     - Get help and share ideas
