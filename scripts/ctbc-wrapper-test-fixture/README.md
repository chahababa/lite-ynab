# Disposable CTBC wrapper test

This temporary branch has no PR or production execution grant. Its branch-only
workflow provisions local Supabase on Linux and runs only the wrapper's rollback,
partial-object STOP, and successful apply / two-phase readback cases.

The SQL templates preserve the private wrapper and readback control flow, original
role DDL and migrations, history writes and postguards. Before publication a local
private comparison restored all permitted substitutions and proved byte identity
for each file. `guard-differences.json` contains public template hashes and counts.
The only template differences are target comments, baseline history rows, event
catalog rows and the synthetic event-review receipt. Runtime masking rechecks
those template hashes and the same skeleton before SQL executes.

The synthetic baseline provisions 16 public Git migrations through S8, excluding
S4A from the disposable fixture only. It uses the public July version and the
local CLI's actual history fingerprints; no private production history seals or
event receipts/bodies are published. Platform event guards use actual local
catalog rows. The rollback case adds one exception immediately before COMMIT.
The half-present case creates only a synthetic `ctbc_events` table and confirms
the phase-1 STOP state and apply guard without executing phase 2.

Passing this test proves only the isolated wrapper. Native SQL Editor identity,
event effects, and transport of the larger production payload remain unverified.
No application, full CI, S8/S9 acceptance, Gmail, OAuth or production operation is
part of this workflow. Product PR63/64/65 heads and migration bytes stay frozen.
