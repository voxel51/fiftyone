.. _virtualenv-guide:

Virtual Environment Setup
=========================

.. default-role:: code

This page describes how to create a Python
`virtual environment <https://docs.python.org/3/tutorial/venv.html>`_.

Using a virtual environment is strongly recommended because it allows
maintaining an isolated environment in which FiftyOne and its dependencies can
be installed. FiftyOne has a variety of dependencies, some versions of which
may conflict with versions already installed on your machine.

Creating a virtual environment using `venv`
-------------------------------------------

First, identify a suitable Python executable. On many systems, this will be
`python3` , but it may be `python` on other systems instead. To confirm your
Python version, pass `--version` to Python. Here is example output from running
these commands:

.. code-block:: text

   $ python --version
   Python 2.7.17
   $ python3 --version
   Python 3.8.9

In this case, `python3` should be used in the next step.

Navigate to a folder where you would like to create the virtual environment.
Using the suitable Python version you have identified, run the following to
create a virtual environment called `env` (you can choose any name):

.. code-block:: shell

   python3 -m venv env

Replace `python3` at the beginning of a command if your Python executable has a
different name. This will create a new virtual environment in the `env` folder,
with standalone copies of Python and pip, as well as an isolated location to
install packages to. However, this environment will not be used until it is
*activated*. To activate the virtual environment, run the following command:

.. tabs::

  .. group-tab:: Linux/macOS

    .. code-block:: shell

      . env/bin/activate

    Be sure to include the leading `.`

  .. group-tab:: Windows

    .. code-block:: text

       env\Scripts\activate.bat

After running this command, your shell prompt should begin with `(env)` , which
indicates that the virtual environment has been activated. This state will only
affect your current shell, so if you start a new shell, you will need to
activate the virtual environment again to use it. When the virtual environment
is active, `python` without any suffix will refer to the Python version you
used to create the virtual environment, so you can use this for the remainder
of this guide. For example:

.. code-block:: text

   $ python --version
   Python 3.8.3

Also note that `python` and `pip` live inside the `env` folder (in this output,
the path to the current folder is replaced with `...`):

.. tabs::

  .. group-tab:: Linux/macOS

    .. code-block:: text

      $ which python
      .../env/bin/python
      $ which pip
      .../env/bin/pip

  .. group-tab:: Windows

    .. code-block:: text

      > where python
      ...\env\Scripts\python.exe
      C:\Program Files\Python38\python.exe
      > where pip
      ...\env\Scripts\pip.exe
      C:\Program Files\Python38\Scripts\pip.exe

Before you continue, you should upgrade `pip` and some related packages in the
virtual environment. FiftyOne's packages rely on some newer pip features, so
older pip versions may fail to locate a downloadable version of FiftyOne
entirely. To upgrade, run the following command:

.. code-block:: shell

   pip install --upgrade pip setuptools wheel

To leave an activated virtual environment and return to using your system-wide
Python installation, run `deactivate`. For more documentation on `venv`,
including additional setup options,
`see here <https://docs.python.org/3/library/venv.html>`_.

Alternatives to `venv`
----------------------

There are lots of ways to set up and work with virtual environments, some of
which are listed here. These may be particularly useful to review if you are
dealing with virtual environments frequently:

* There is a similar
  `virtualenv package <https://pypi.org/project/virtualenv/>`_
  (`pip install virtualenv`) that supports older Python versions.
* `virtualenvwrapper <https://virtualenvwrapper.readthedocs.io/en/latest/>`_
  adds some convenient shell support for creating and managing virtual
  environments.

.. warning::

  We currently discourage using `pipenv` with FiftyOne, as it has known issues
  with installing packages from custom package indices.
