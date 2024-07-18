@echo off
:: Installs the `fiftyone` package and its dependencies.
::
:: Usage:
:: .\install.bat
::
:: Copyright 2017-2024, Voxel51, Inc.
:: voxel51.com
::
:: Commands:
:: -h      Display help message
:: -d      Install developer dependencies.
:: -e      Source install of voxel51-eta.
:: -m      Install MongoDB from scratch, rather than installing fiftyone-db.
:: -p      Install only the core python package, not the App.
:: -v      Voxel51 developer install (don't install fiftyone-brain).

set SHOW_HELP=false
set DEV_INSTALL=false
set SOURCE_ETA_INSTALL=false
set SCRATCH_MONGODB_INSTALL=false
set BUILD_APP=true
set VOXEL51_INSTALL=false
set USE_FIFTY_ONE_DB=true

:parse
IF "%~1"=="" GOTO endparse
IF "%~1"=="-h" GOTO helpmessage
IF "%~1"=="-d" set DEV_INSTALL=true
IF "%~1"=="-e" set SOURCE_ETA_INSTALL=true
IF "%~1"=="-m" set USE_FIFTY_ONE_DB=false
IF "%~1"=="-p" set BUILD_APP=false
IF "%~1"=="-v" set VOXEL51_INSTALL=true
SHIFT
GOTO parse
:endparse

IF %USE_FIFTY_ONE_DB%==true (
  echo ***** INSTALLING FIFTYONE-DB *****
  pip install fiftyone-db
) else (
  echo ***** USING LOCAL MONGODB *****
)

IF %VOXEL51_INSTALL%==false (
  echo ***** INSTALLING FIFTYONE-BRAIN *****
  pip install --upgrade fiftyone-brain
)

echo ***** INSTALLING FIFTYONE *****
set IS_DEV_INSTALL_FLAG=false
IF %DEV_INSTALL%==true set IS_DEV_INSTALL_FLAG=true
IF %VOXEL51_INSTALL%==true set IS_DEV_INSTALL_FLAG=true

IF %IS_DEV_INSTALL_FLAG%==true (
  echo Performing dev install
  pip install -r requirements/dev.txt
  pre-commit install
  pip install .
) else (
  pip install -r requirements.txt
  pip install .
)

IF %SOURCE_ETA_INSTALL%==true (
  echo ***** INSTALLING ETA *****
  if not exist "eta\" (
    echo Cloning ETA repository
    git clone https://github.com/voxel51/eta
  )
  cd eta
  pip install .
  if not exist "eta\config.json" (
    echo "Installing default ETA config"
    xcopy /y ".\config-example.json" ".\eta\config.*"
  )
  cd ..
)

if %BUILD_APP%==true (
  echo ***** INSTALLING FIFTYONE-APP *****
  :: TODO - Add nvm and yarn installs
  cd app
  echo "Building the App. This will take a minute or two..."
  call yarn install > /dev/null 2>&1
  call yarn build:win32
  cd ..
)

echo ***** INSTALLATION COMPLETE *****
exit /b

:helpmessage
echo Additional Arguments:
echo -h      Display help message
echo -d      Install developer dependencies.
echo -e      Source install of voxel51-eta.
echo -m      Use local mongodb instead of installing fiftyone-db.
echo -p      Install only the core python package, not the App.
echo -v      Voxel51 developer install (don't install fiftyone-brain).
exit /b