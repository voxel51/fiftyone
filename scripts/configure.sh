#!/bin/bash
set -e

# Variables
NODE_VERSION=${NODE_VERSION:-"18"}  # Default Node.js version
PYTHON_VERSION=${PYTHON_VERSION:-"3.10"}  # Default Python version
POETRY_HOME="${HOME}/.venv-poetry"
BIN_DIR="${HOME}/bin"
GIT_ROOT=$(git rev-parse --show-toplevel)
NVM_VERSION="v0.40.0"

rc_interactive=".zshrc"
rc_non_interactive=".zprofile"

venvs=( "package/teams" )

case "$SHELL" in 
  /bin/zsh)
    rc_interactive=".zshrc"
    rc_non_interactive=".zprofile"
    ;;
  /bin/bash)
    rc_interactive=".bashrc"
    rc_non_interactive=".bash_profile"
    ;;
  *)
    echo "WARN: Your shell isn't in the expected shells. Your RC file might not modified properly."
    ;;
esac

rcs=( $rc_interactive $rc_non_interactive )

# Install nvm
install_nvm() {
  NVM_DIR="$HOME/.nvm"

  if [[ -f "$NVM_DIR/nvm.sh" ]]; then
    echo "NVM installed. Skipping installation"
  else
    echo "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash
  fi

  for rc in "${rcs[@]}"; do
    if ! grep NVM_DIR "$HOME/$rc" &> /dev/null; then
      echo "Updating $rc"
      {
        echo 'export NVM_DIR="$HOME/.nvm"'
        echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
        echo '[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"'
      } >> "$HOME/$rc"
    fi
  done
  echo "Please source $HOME/$rc_interactive for nvm to be detected"
  . $HOME/$rc_non_interactive
  nvm install "$NODE_VERSION"
}

# Install pyenv
install_pyenv() {
  PYENV_ROOT="$HOME/.pyenv"
  if [[ -d "$PYENV_ROOT" ]]; then
    echo "Pyenv installed. Skipping installation"
  else
    echo "Installing pyenv..."
    curl https://pyenv.run | bash
  fi
  for rc in "${rcs[@]}"; do
    if ! grep PYENV_ROOT "$HOME/$rc" &> /dev/null; then
      echo "Updating $rc"
      {
        echo 'export PYENV_ROOT="$HOME/.pyenv"'
        echo '[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"'
        echo 'eval "$(pyenv init -)"'
      } >> "$HOME/$rc"
    fi
  done
    
  echo "Please source $HOME/$rc_interactive for pyenv to be detected"
  . $HOME/$rc_non_interactive
  pyenv install "${PYTHON_VERSION}" --skip-existing
}

# Install development dependencies
install_venvs() {
  . $HOME/$rc_non_interactive
  echo "Installing development dependencies..."
  cd "${GIT_ROOT}"
  pyenv shell "$PYTHON_VERSION"

  for venv in "${venvs[@]}"; do
    pushd "${venv}"
    if [[ ! -d ./.venv/bin ]]; then
      python -m venv .venv
    fi
    . ./.venv/bin/activate
    pip install keyrings.google-artifactregistry-auth
    deactivate
    popd
  done
}

# Main
main() {
  install_nvm
  install_pyenv
  install_venvs
}

main