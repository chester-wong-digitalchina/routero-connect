# Codex acceptance fixture

Copy `calculator.py` and `test_calculator.py` to `tmp/validation/calculator/` before a live test. Do not run an agent against this committed fixture. The baseline has addition and multiplication only.

Initial task:

> Read calculator.py and test_calculator.py. Add a subtract(left, right) function and tests for positive, negative, equal, and fractional operands. Use your normal file-editing tool, run python -m unittest -v, and explain the changes and test result. Work only inside this calculator project.

Follow-up in the same conversation:

> What does subtract(-3, -8) return? Explain using the implementation you just added, and confirm that the existing multiplication test still passes.

Independently inspect the final files and run `python -m unittest -v`. Confirm `subtract(5, 2) == 3`, `subtract(-3, -8) == 5`, `subtract(4, 4) == 0`, and `subtract(1.5, 0.25) == 1.25`. Record actual tool calls, edits, commands, and outcomes; a narrative claim is insufficient evidence.
