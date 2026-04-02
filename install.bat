@echo off
:: Installs the `fiftyone` package and its dependencies.
::
:: Usage:
:: .\install.bat
::
:: Copyright 2017-2026, Voxel51, Inc.
:: voxel51.com
::
:: Commands:
:: -h      Display help message
:: -b      Source install of fiftyone-brain
:: -d      Install developer dependencies.
:: -e      Source install of voxel51-eta.
:: -m      Install MongoDB from scratch, rather than installing fiftyone-db.
:: -p      Install only the core python package, not the App.
:: -o      Install docs dependencies.

set SHOW_HELP=false
set SOURCE_BRAIN_INSTALL=false
set DEV_INSTALL=false
set SOURCE_ETA_INSTALL=false
set SCRATCH_MONGODB_INSTALL=false
set BUILD_APP=true
set USE_FIFTY_ONE_DB=true
set DOCS_INSTALL=false

:parse
IF "%~1"=="" GOTO endparse
IF "%~1"=="-h" GOTO helpmessage
IF "%~1"=="-b" set SOURCE_BRAIN_INSTALL=true
IF "%~1"=="-d" set DEV_INSTALL=true
IF "%~1"=="-e" set SOURCE_ETA_INSTALL=true
IF "%~1"=="-m" set USE_FIFTY_ONE_DB=false
IF "%~1"=="-p" set BUILD_APP=false
IF "%~1"=="-o" set DOCS_INSTALL=true
SHIFT
GOTO parse
:endparse

:: Resolve pip backend
where uv >nul 2>&1
IF NOT ERRORLEVEL 1 (
  set PIP=uv pip
) else (
  where pip >nul 2>&1
  IF ERRORLEVEL 1 (
    echo ERROR: Neither 'uv' nor 'pip' found in PATH. Please install one before running this script.
    exit /b 1
  )
  set PIP=pip
)

:: Check Python version (3.9 - 3.12 supported)
for /f "tokens=*" %%v in ('python -c "import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")" 2^>nul') do set PY_VER=%%v
if "%PY_VER%"=="" (
  echo ERROR: Python not found in PATH.
  exit /b 1
)
for /f "tokens=1,2 delims=." %%a in ("%PY_VER%") do (
  set PY_MAJOR=%%a
  set PY_MINOR=%%b
)
if %PY_MAJOR% NEQ 3 (
  echo Python %PY_VER% is NOT supported. Please use Python 3.9 - 3.12.
  exit /b 1
)
if %PY_MINOR% LSS 9 (
  echo Python %PY_VER% is NOT supported. Please use Python 3.9 - 3.12.
  exit /b 1
)
if %PY_MINOR% GTR 12 (
  echo Python %PY_VER% is NOT supported. Please use Python 3.9 - 3.12.
  exit /b 1
)
echo Python %PY_VER% is supported.

:: Do this first so pip installs with a built app
if %BUILD_APP%==true (
  echo ***** INSTALLING FIFTYONE-APP *****
  :: TODO - Add nvm and yarn installs
  cd app
  echo Building the App. This will take a minute or two...
  call yarn install > nul 2>&1
  call yarn build:win32
  cd ..
)

IF %USE_FIFTY_ONE_DB%==true (
  echo ***** INSTALLING FIFTYONE-DB *****
  %PIP% install fiftyone-db
) else (
  echo ***** USING LOCAL MONGODB *****
)

echo ***** INSTALLING FIFTYONE-BRAIN *****
IF %SOURCE_BRAIN_INSTALL%==true (
  if not exist "fiftyone-brain\" (
    if not exist "..\fiftyone-brain\" (
      echo Cloning FiftyOne Brain repository
      git clone https://github.com/voxel51/fiftyone-brain
    )
  )
  pushd .
  if exist "..\fiftyone-brain\" (
    cd ..\fiftyone-brain
  ) else (
    cd fiftyone-brain
  )
  IF %DEV_INSTALL%==true (
    echo Performing dev install
    CALL install.bat -d
  ) else (
    echo Performing install
    %PIP% install .
  )
  popd
) else (
  %PIP% install --upgrade fiftyone-brain
)

echo ***** INSTALLING FIFTYONE *****
IF %DEV_INSTALL%==true (
  echo Performing dev install
  %PIP% install -r requirements/dev.txt
  pre-commit install
  %PIP% install .
) else if %DOCS_INSTALL%==true (
  echo Performing docs install
  %PIP% install -r requirements/docs.txt
  %PIP% install -e .
) else (
  echo Performing install
  %PIP% install .
)

IF %SOURCE_ETA_INSTALL%==true (
  echo ***** INSTALLING ETA FROM SOURCE *****
  if not exist "eta\" (
    if not exist "..\eta\" (
      echo Cloning ETA repository
      git clone https://github.com/voxel51/eta
    )
  )
  pushd .
  if exist "..\eta\" (
    cd ..\eta
  ) else (
    cd eta
  )
  IF %DEV_INSTALL%==true (
    echo Performing dev install
    %PIP% install .
  ) else (
    echo Performing install
    %PIP% install .
  )
  if not exist "eta\config.json" (
    echo "Installing default ETA config"
    xcopy /y ".\config-example.json" ".\eta\config.*"
  )
  popd
)

echo ***** INSTALLATION COMPLETE *****
exit /b

:helpmessage
echo Additional Arguments:
echo -h      Display help message
echo -b      Source install of fiftyone-brain.
echo -d      Install developer dependencies.
echo -e      Source install of voxel51-eta.
echo -m      Use local mongodb instead of installing fiftyone-db.
echo -p      Install only the core python package, not the App.
echo -o      Install docs dependencies.
exit /b
