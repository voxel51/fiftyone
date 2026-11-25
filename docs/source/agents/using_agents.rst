
.. _agents-using-agents:

Using Agents
============

.. default-role:: code

.. meta::
    :description: How to connect AI assistants to a Voxel51 deployment
        using the Voxel51 plugin: the agent gateway (MCP), the v51 CLI and
        the voxel51 Python SDK, authenticated as yourself with your own
        account permissions.

.. customavailablein::
    :enterprise_version: 2.26.0

.. note::

    Remote agent access is a Voxel51 feature and must be explicitly enabled
    by your deployment's administrator. If it's not enabled yet, ask your Voxel51 admin.

.. _using-agents-outcomes:

What You'll Have When You're Done
__________________________________

- Your coding agent (Claude Code, Codex, Cursor, Antigravity, GitHub Copilot,
  or any MCP-compliant client) connected directly to your Voxel51 deployment
- The ``v51`` CLI and the ``voxel51`` Python SDK installed and signed in, if
  you want them
- A one-time browser approval instead of a shared credential: the agent acts
  with exactly your own role and dataset permissions
- The ability to ask your agent to run any Voxel51 operator you're permitted
  to use, script against your datasets in Python, or automate them from a
  shell

.. _using-agents-prereqs:

Before You Start
_________________

- A Voxel51 deployment with remote agent access enabled by an admin
- Your deployment's host: Voxel51 Cloud is always ``app.voxel51.com``; for a
  self-hosted deployment, ask your admin
- A coding agent that supports plugins or skills (Claude Code, Codex, Cursor,
  Antigravity, GitHub Copilot, and most others do); if yours doesn't, skip to
  :ref:`Manual Configuration <using-agents-manual>` below

.. _using-agents-quickstart:

Quick Start
___________

.. _using-agents-step1:

Step 1: Install the Voxel51 Plugin
-----------------------------------

The `Voxel51 plugin <https://github.com/voxel51/voxel51-skills>`_ bundles the
agent gateway connection and the skills that teach your agent to use it, the
``v51`` CLI and the ``voxel51`` Python SDK.

.. tabs::

   .. tab:: Claude Code

      .. code-block:: text

          /plugin marketplace add voxel51/voxel51-skills
          /plugin install voxel51@voxel51

   .. tab:: Codex

      Add ``voxel51/voxel51-skills`` as a plugin marketplace and install
      ``voxel51``.

   .. tab:: Cursor, Antigravity, GitHub Copilot

      Install ``voxel51`` from the client's plugin marketplace, or add
      ``voxel51/voxel51-skills`` as a marketplace.

   .. tab:: Other agents

      The installer supports Claude Code, Cursor, Codex, OpenCode, GitHub
      Copilot, Amp, Antigravity, Roo Code, Kilo Code and Goose. When it asks
      which skills to install, press ``a`` for all of them, or include
      ``voxel51-setup``, because the next step needs the setup skill.

      .. code-block:: bash

          curl --proto '=https' --tlsv1.2 -fsSL https://skil.sh | sh -s -- voxel51/voxel51-skills

Then paste this into your agent's chat:

.. code-block:: prompt

    Set up Voxel51

A client's **Connect** button only authorizes the MCP server. The setup skill
also installs and signs in the CLI and SDK, if you want them, and verifies
each one. Your agent asks which deployment you're on, what you want to set up,
and walks you through each browser approval.

.. _using-agents-step2:

Step 2: What to Expect
------------------------

Your agent asks which deployment you're on (Voxel51 Cloud or self-hosted)
and finishes the setup on its own. When it first uses the connection, your
browser opens to a one-time approval screen:

.. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/mcp_oauth_approval.webp
   :alt: One-time browser approval screen for connecting a coding agent to a Voxel51 deployment
   :align: center

Sign in and click **Approve**. No API key or token to copy anywhere:

.. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/mcp_auth_success.webp
   :alt: Browser confirmation that authentication succeeded and you can return to your coding agent
   :align: center

Close the tab and return to your agent; it picks up from there. If you also
set up the CLI, you approve a second, separate sign-in: it prints a URL and a
code, and you approve the code in any browser.

.. note::

    New MCP servers only attach on the next session. If the tools don't
    appear right away, restart your agent (or start a fresh conversation)
    and try again.

.. _using-agents-manual:

Step 3: Manual Configuration (optional)
------------------------------------------

Prefer to configure it yourself, without installing the plugin? Add the
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

The gateway's authorization server has one fixed public client,
``voxel51-agent-mcp``, and does not support Dynamic Client Registration. A
client that tries to register itself, or that sends another client id, is
refused, so every configuration below pins this id. It is not a secret.

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

         .. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/claude_desktop_add_custom_connector.webp
            :alt: Claude Desktop's Add menu, with Add custom connector highlighted
            :align: center

      3. Enter a name and the gateway URL.

         .. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/claude_desktop_connector_details.webp
            :alt: Add custom connector dialog with a name and the gateway URL filled in
            :align: center

      4. Under **OAuth client**, choose **Use your own OAuth client** (not
         *Register automatically*, which attempts Dynamic Client
         Registration and fails against this deployment) and enter
         ``voxel51-agent-mcp``.

         .. image:: https://cdn.voxel51.com/voxel-agent/mcp-server/claude_desktop_oauth_client.webp
            :alt: OAuth client section with Use your own OAuth client selected and the client ID filled in
            :align: center

      5. Click **Add**, then sign in when prompted.

   .. tab:: Antigravity

      Add to ``~/.gemini/config/mcp_config.json`` (global) or
      ``<workspace>/.agents/mcp_config.json`` (workspace-scoped):

      .. code-block:: json

          {
            "mcpServers": {
              "voxel51-agent-gateway": {
                "serverUrl": "https://<your-deployment>/api/proxy/fiftyone-teams/mcp",
                "oauth": {
                  "clientId": "voxel51-agent-mcp"
                }
              }
            }
          }

      Remote servers use ``serverUrl``, not ``url``. Restart Antigravity (or
      reload the window) after editing the file.

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

   .. tab:: OpenAI Codex

      Add to ``~/.codex/config.toml`` (or ``.codex/config.toml`` in a
      trusted project):

      .. code-block:: toml

          [mcp_servers.voxel51-agent-gateway]
          url = "https://<your-deployment>/api/proxy/fiftyone-teams/mcp"

          [mcp_servers.voxel51-agent-gateway.oauth]
          client_id = "voxel51-agent-mcp"

      Or from the CLI:

      .. code-block:: bash

          codex mcp add voxel51-agent-gateway \
            --url https://<your-deployment>/api/proxy/fiftyone-teams/mcp
          codex mcp login voxel51-agent-gateway

      Then edit the generated entry to add the ``oauth.client_id`` shown
      above; ``codex mcp add`` alone doesn't accept a client id and falls
      back to Dynamic Client Registration, which this deployment doesn't
      support.

Restart your agent after adding the server; new MCP servers only attach on
the next session. Then trigger the connection (e.g. by trying to use one of
the new tools): your agent opens a browser for a one-time OAuth consent
screen. Sign in and approve, no API key needed. If your client's config has
no way to pin a client id, install the plugin instead (Step 1), which ships the
configuration.

.. _using-agents-step4:

Step 4: Use It
---------------

.. code-block:: prompt

    "List the Voxel51 operators I can run"
    "Run the duplicate-detection operator on my quickstart dataset"
    "Evaluate my model's predictions and summarize the results"
    "Check the status of my last background run"

Your agent discovers the operators your account is permitted to run, live
on every call, and executes the appropriate tools.

.. _using-agents-interfaces:

Choosing an Interface
______________________

The plugin teaches your agent three interfaces and when to use each:

.. list-table::
   :widths: 40 30 30
   :header-rows: 1

   * - You want to
     - Interface
     - Skill
   * - Browse datasets, run an operator the platform ships, ask quick
       questions
     - Agent gateway (remote MCP)
     - ``voxel51-operators``
   * - Run repeatable shell commands, CI steps, bulk tag or delete, pipe
       samples through ``jq``
     - ``v51`` CLI
     - ``voxel51-cli``
   * - Write a Python script or notebook, read DataFrames, port existing code
     - ``voxel51`` Python SDK
     - ``voxel51-sdk``
   * - Work inside the platform with no coding agent
     - The built-in Voxel51 agent in the App
     -

Install the CLI and SDK with ``pip install voxel51``. Sign in the CLI with
``v51 auth login --url <deployment-url> --no-browser``, which prints a URL and
a code to approve in any browser. The SDK reads the CLI's login, or
``V51_URL`` and ``V51_API_KEY`` in CI. The setup skill does all of this for
you.

.. _using-agents-overview:

How This Works
_______________

**The agent gateway** connects your agent directly to your Voxel51
deployment over the open `Model Context Protocol
<https://modelcontextprotocol.io>`_ standard. Skills and MCP solve different
parts of the same problem: MCP exposes what your deployment can do, while a
skill like ``voxel51-operators`` teaches the agent how and when to do it, so
you get a repeatable workflow instead of a list of raw tool calls.

**The Voxel51 skills** don't stop at connecting the agent. Once you're
connected, other skills teach it to complete specific tasks end to end:
check data quality, evaluate models, import and export data, search by
embedding, and more. See the :ref:`Agent Ecosystem <agents-skills>` for the
full list, or :ref:`develop your own <developing-skills-authoring>`.

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
   * - `Voxel51 plugin <https://github.com/voxel51/voxel51-skills>`_
     - Skills and MCP configuration for AI assistants, including
       ``voxel51-setup``
   * - `v51 CLI reference <https://github.com/voxel51/voxel51-sdk/blob/main/docs/cli/index.md>`_
     - Every ``v51`` command, flag and exit code
   * - `voxel51 Python SDK <https://github.com/voxel51/voxel51-sdk/blob/main/python/README.md>`_
     - The async Python client
   * - `FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_
     - Official plugin collection for the App
   * - `Model Context Protocol <https://modelcontextprotocol.io>`_
     - MCP specification
   * - `Voxel51 documentation <https://docs.voxel51.com/enterprise/index.html>`_
     - Voxel51 Cloud and self-hosted deployment docs
   * - `Discord Community <https://discord.gg/fiftyone-community>`_
     - Get help and share ideas
