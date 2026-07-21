# inject

The injection namespace connects concrete adapters to the format-neutral
runtime and registers application-facing views. It is allowed to know both
sides because composition has to happen somewhere. This has to be super
minimal.

It may connect adapters, runtime capabilities, and views. Nothing else should
depend on it, and optional enterprise behavior enters through one explicit
overlay seam.
