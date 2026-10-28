
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
    by your deployment's administrator. If it's not enabled yet, ask your Voxel51 admin.

.. _using-agents-outcomes:

What You'll Have When You're Done
__________________________________

- Your coding agent (Claude Code, Cursor, or any MCP-compliant client)
  connected directly to your Voxel51 deployment
- A one-time browser approval instead of a shared credential: the agent acts
  with exactly your own role and dataset permissions
- The ability to ask your agent to run any FiftyOne operator you're permitted
  to use, in the foreground or as a background run

.. _using-agents-prereqs:

Before You Start
_________________

- A Voxel51 deployment with remote agent access enabled by an admin
- Your deployment's host: Voxel51 Cloud is always ``app.voxel51.com``; for a
  self-hosted deployment, ask your admin
- A coding agent that can fetch a URL and act on what it reads (Claude Code,
  Cursor, and most others can); if yours can't, skip to
  :ref:`Manual Configuration <using-agents-manual>` below

.. _using-agents-quickstart:

Quick Start
___________

.. _using-agents-step1:

Step 1: Copy the Prompt
-------------------------

Paste this into your agent's chat:

.. code-block:: prompt

    Read and follow https://raw.githubusercontent.com/voxel51/fiftyone-skills/main/skills/voxel51-agent-setup/SKILL.md
    to connect me to my Voxel51 deployment.

That's it, no install step first. Your agent fetches the skill and takes it
from there: asks which deployment you're on, configures the connection, and
walks you through the one-time browser approval below.

Prefer a persistent install over a one-off fetch? Run the universal
installer and select **voxel51-agent-setup**, then use the same prompt:

.. code-block:: bash

    curl -fsSL https://skil.sh | sh -s -- voxel51/fiftyone-skills

.. _using-agents-step2:

Step 2: What to Expect
------------------------

Your agent asks which deployment you're on (Voxel51 Cloud or self-hosted),
then configures the connection on its own. When it tries to use the
connection for the first time, your browser opens to a one-time approval
screen:

.. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/mcp_oauth_approval.webp
   :alt: One-time browser approval screen for connecting a coding agent to a Voxel51 deployment
   :align: center

Sign in and click **Approve**. No API key or token to copy anywhere:

.. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/mcp_auth_success.webp
   :alt: Browser confirmation that authentication succeeded and you can return to your coding agent
   :align: center

Close the tab and return to your agent; it picks up from there and confirms
the connection.

.. note::

    New MCP servers only attach on the next session. If the tools don't
    appear right away, restart your agent (or start a fresh conversation)
    and try again.

.. _using-agents-manual:

Step 3: Manual Configuration (optional)
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

Restart your agent after adding the server; new MCP servers only attach on
the next session. Then trigger the connection (e.g. by trying to use one of
the new tools): your agent opens a browser for a one-time OAuth consent
screen. Sign in and approve, no API key needed. If your client's config has
no way to pin a client id, install the skill instead (Step 1).

.. _using-agents-step4:

Step 4: Use It
---------------

.. code-block:: prompt

    "List the FiftyOne operators I can run"
    "Run the duplicate-detection operator on my quickstart dataset"
    "Evaluate my model's predictions and summarize the results"
    "Check the status of my last background run"

Your agent discovers the operators your account is permitted to run, live
on every call, and executes the appropriate tools.

.. _using-agents-overview:

How This Works
_______________

**The agent gateway** connects your agent directly to your Voxel51
deployment over the open `Model Context Protocol
<https://modelcontextprotocol.io>`_ standard. Skills and MCP solve different
parts of the same problem: MCP exposes what your deployment can do, while a
skill like ``voxel51-agent-setup`` teaches the agent how and when to do it,
so you get a repeatable workflow instead of a list of raw tool calls.

**FiftyOne Skills** don't stop at connecting the agent. Once you're
connected, other skills teach it to complete specific tasks end to end:
import data, find duplicates, visualize embeddings, and more. See the
:ref:`Agent Ecosystem <agents-skills>` for the full list, or
:ref:`develop your own <developing-skills-authoring>`.

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
