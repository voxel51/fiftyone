
.. _agents-ecosystem:

Agent Ecosystem
===============

.. default-role:: code

Welcome to the FiftyOne Agent Ecosystem! 🤖

Here you'll discover expert workflows, MCP-powered tools, and skills that
let AI assistants take real action on your data.

FiftyOne agents go beyond code generation. They import datasets, run
model inference, find duplicates, evaluate predictions, and build custom
plugins, all from a single prompt. Browse the skills below to see what
your agent can do out of the box, or :ref:`develop your own
<data-agents-developing>`.


.. _data-agents-skills:

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="skill-search" placeholder="Search skills...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. customanimatedcta::
    :button_text: Build Your Own Workflow
    :button_link: developing_skills.html
    :align: right

.. raw:: html

    <div id="plugin-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </nav>

    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">

.. include:: skills_cards/skill_cards.rst

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. toctree::
   :maxdepth: 1
   :hidden:

   Using Agents <using_agents>
   Developing Tools & Skills <developing_skills>
