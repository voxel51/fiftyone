.. _upgrading-mongodb:

Upgrading MongoDB
=================

.. default-role:: code

The instructions on this page apply to FiftyOne users who are using the MongoDB
binary that is bundled with FiftyOne.

If you utilize a
:ref:`custom/shared MongoDB database <configuring-mongodb-connection>`, then
follow the upgrade path advised by your database provider.

.. note::

    It is strongly recommended to perform a backup of your MongoDB database
    before upgrading your MongoDB version.

.. _upgrading-to-mongodb-8:

Upgrading to MongoDB 8
----------------------

1.  Close any Python sessions that are running `fiftyone`

2.  Ensure that the bundled mongo process has been shut down

.. tabs::

  .. group-tab:: Linux

    .. code-block:: shell

        ps -ef | egrep "fiftyone.*mongod"

  .. group-tab:: macOS

    .. code-block:: shell

        ps -ef | egrep "fiftyone.*mongod"

  .. group-tab:: Windows

    .. code-block:: shell
    
        Get-Process | \
            Where-Object { \
                $_.Name -like "*fiftyone*" \
                -and $_.Name -like "*mongod*" \
            }

3.  Upgrade to `fiftyone>=1.3` and `fiftyone-db>=1.2.0`

    .. code-block:: shell

        pip install --upgrade fiftyone fiftyone[db]

4.  `Install mongosh <https://www.mongodb.com/docs/mongodb-shell/install>`_

5.  Find the MongoDB URI using your operating system's network libraries

.. tabs::

  .. group-tab:: Linux

    .. code-block:: shell

        sudo lsof -iTCP -sTCP:LISTEN -P -n | egrep "mongod"

  .. group-tab:: macOS

    .. code-block:: shell

        sudo lsof -iTCP -sTCP:LISTEN -P -n | egrep "mongod"

  .. group-tab:: Windows

    .. code-block:: shell
    
        Get-NetTCPConnection | \
            Where-Object { $_.State -eq 'Listen' } | \
            Select-String -Pattern "mongod"

6.  Connect to MongoDB using `mongosh`

    .. code-block:: shell

        mongosh "$URI_FROM_ABOVE"

7.  Enable
    `backwards-incompatible MongoDB 8.0 features <https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-standalone/#enable-backwards-incompatible--features>`_
    by setting your database's feature compatibility version

    .. code-block:: javascript
    
        db.adminCommand({ 
            setFeatureCompatibilityVersion: "8.0", 
            confirm: true 
        })

        // Verify the upgrade
        db.adminCommand({ 
            getParameter: 1, 
            featureCompatibilityVersion: 1 
        })
