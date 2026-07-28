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

set MINOR_MIN=10
set MINOR_MAX=13

where python >nul 2>&1
IF NOT ERRORLEVEL 1 (
  set PYTHON_CMD=python
) else (
  where py >nul 2>&1
  IF ERRORLEVEL 1 (
    echo ERROR: Neither 'python' nor 'py' found in PATH.
    exit /b 1
  )
  set PYTHON_CMD=py
)

for /f %%v in ('%PYTHON_CMD% -c "import sys; print(""{}.{}"".format(sys.version_info[0], sys.version_info[1]))"') do set PY_VER=%%v
for /f %%s in ('%PYTHON_CMD% -c "import sys; print('SUPPORTED' if (sys.version_info[0] == 3 and %MINOR_MIN% <= sys.version_info[1] <= %MINOR_MAX%) else 'UNSUPPORTED')"') do set PY_STATUS=%%s
IF /I NOT "%PY_STATUS%"=="SUPPORTED" (
  echo Python %PY_VER% is NOT supported. Please use Python 3.%MINOR_MIN% - 3.%MINOR_MAX%.
  exit /b 1
)
echo Python %PY_VER% is supported.

IF "%DEV_INSTALL%"=="true" (
  where uv >nul 2>&1
  IF ERRORLEVEL 1 (
    echo ERROR: uv 0.11.32 is required for development installs.
    exit /b 1
  )
)
IF "%DOCS_INSTALL%"=="true" (
  where uv >nul 2>&1
  IF ERRORLEVEL 1 (
    echo ERROR: uv 0.11.32 is required for docs installs.
    exit /b 1
  )
)

:: Ensure package installs target an explicit Python interpreter
set "PIP_PYTHON=%PYTHON_CMD%"

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

IF %DEV_INSTALL%==true (
  uv sync --locked --python %PYTHON_CMD% --no-install-project
  IF ERRORLEVEL 1 exit /b 1
  set "VIRTUAL_ENV=%CD%\.venv"
  set "PIP_PYTHON=%CD%\.venv\Scripts\python.exe"
) else if %DOCS_INSTALL%==true (
  uv sync --locked --python %PYTHON_CMD% --no-default-groups --group docs --no-install-project
  IF ERRORLEVEL 1 exit /b 1
  set "VIRTUAL_ENV=%CD%\.venv"
  set "PIP_PYTHON=%CD%\.venv\Scripts\python.exe"
)

IF %USE_FIFTY_ONE_DB%==true (
  echo ***** INSTALLING FIFTYONE-DB *****
  IF %DEV_INSTALL%==true (
    echo Using fiftyone-db from the locked environment
  ) else if %DOCS_INSTALL%==true (
    echo Using fiftyone-db from the locked environment
  ) else (
    CALL :pip_install fiftyone-db
  )
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
    CALL :pip_install .
  )
  popd
) else (
  IF %DEV_INSTALL%==true (
    echo Using fiftyone-brain from the locked environment
  ) else if %DOCS_INSTALL%==true (
    echo Using fiftyone-brain from the locked environment
  ) else (
    CALL :pip_install --upgrade fiftyone-brain
  )
)

echo ***** INSTALLING FIFTYONE *****
IF %DEV_INSTALL%==true (
  echo Performing dev install
  uv sync --locked --python %PYTHON_CMD%
  IF ERRORLEVEL 1 exit /b 1
  uv run --locked --no-sync pre-commit install
  IF ERRORLEVEL 1 exit /b 1
) else if %DOCS_INSTALL%==true (
  echo Performing docs install
  uv sync --locked --python %PYTHON_CMD% --no-default-groups --group docs
  IF ERRORLEVEL 1 exit /b 1
) else (
  echo Performing install
  CALL :pip_install .
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
    CALL :pip_install .
  ) else (
    echo Performing install
    CALL :pip_install .
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

:pip_install
where uv >nul 2>&1
IF NOT ERRORLEVEL 1 (
  uv pip install --python "%PIP_PYTHON%" %*
) else (
  "%PIP_PYTHON%" -m pip install %*
)
exit /b %ERRORLEVEL%
