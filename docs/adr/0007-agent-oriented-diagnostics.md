# 0007. Agent-Oriented Diagnostics

Date: 2026-11-18

Status: Accepted

## Context

The DIY CLI rendered each diagnostic with a `@babel/code-frame` snippet: a location
line, several lines of surrounding source, a caret under the reported column, and the
message attached to the caret.

In practice, DIY diagnostics are read by coding agents that run `diy-cli` and act on
its output. For those readers the code frame is noise. The agent already has the file
and can open it at the reported location; the extra lines cost tokens, split the
message away from the location, and make the output harder to grep or parse line by
line. The CLI also had to re-read every source file only to draw the frame.

## Decision

Remove the code frame. Every diagnostic starts with a header line holding the location
and the violated rule, followed by the message and the existing notes on indented lines:

```text
src/main.ts:7:8 unused capability
  Declares unused capability "writer".
  = help: remove "writer" from `Capabilities<...>`, or add a real `capabilities.writer` read if it is required
```

DIY error output is designed for coding agents, not humans. Diagnostics should:

- be plain text and machine-greppable, with no code frames, carets, colors, or other
  decoration;
- start each problem with one `path:line:column rule` header line, and put the message
  and notes on their own indented lines below it;
- state which rule was violated and why;
- give an actionable fix or hint note where the analyzer knows one, without inventing
  guesses where it does not;
- stay deterministic.

## Consequences

- Output is shorter and each problem can be found with a single `grep` on the path or
  rule name.
- The CLI no longer reads source files for reporting, and `@babel/code-frame` is no
  longer a dependency.
- Humans reading the output see no source context and must open the file at the
  reported location.

## Alternatives Considered

- Keep the code frame behind a flag. Rejected: no current reader needs it, and it would
  keep a dependency and an untested output mode alive.
