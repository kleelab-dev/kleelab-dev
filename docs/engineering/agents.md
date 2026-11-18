# How the agent team works

The agents live in `.claude/agents/`. The main Claude session coordinates them,
because one agent cannot start another.

## The flow

```
request ─► tech-lead ─► spec ─► YOU APPROVE
                                    │
              ┌─────────────────────┼──────────────────────┐
     backend-engineer      frontend-engineer      admin-engineer
              │            content-strategist            │
              └─────────────────────┼──────────────────────┘
                              test-engineer
                                    │
        ┌───────────────────────────┼───────────────────────────┐
   code-reviewer           security-reviewer              qa-engineer
        └───────────────────────────┼───────────────────────────┘
                     fixes go back to the builder
                                    │
                    release-manager ─► YOU APPROVE ─► push to main
```

1. **Plan.** `tech-lead` writes `docs/specs/<yyyy-mm-dd>-<slug>.md` from
   `docs/specs/_template.md`. Building starts only after you approve it.
2. **Build.** Backend goes first when the API changes, so the frontend builds
   against the real contract. Builders that run at the same time each work in
   their own git worktree. Builders never commit.
3. **Test.** `test-engineer` turns the acceptance criteria into checks.
4. **Check.** The three reviewers run at the same time and cannot edit. A
   *blocker* sends the work back to the builder; it is never waved through.
5. **Ship.** `release-manager` runs the final gate, writes the commit and
   pushes to `main` once you say so.

Small changes (a copy tweak, a one-line fix) can skip the spec: builder, then
`code-reviewer`, then `release-manager`.

## The report every agent returns

```
## Result: DONE | BLOCKED | NEEDS DECISION
Spec: docs/specs/<file>.md

### Changed
- path/to/file — what changed and why

### Checks run
$ <command>
<real output, trimmed to what matters>

### Findings          (reviewers only)
- [BLOCKER|MAJOR|MINOR] path:line — what is wrong, what happens, how to fix

### Risks and open questions
- ...
```

A check that was not run is listed as **not run**, with the reason.

## Automatic checks

`.claude/settings.json` runs two hooks for every agent:

- After each edit: ESLint on the edited `.ts`/`.tsx` file, or a syntax compile
  on the edited `.py` file. A failure is shown to the agent straight away.
- Before an agent or session finishes: `tsc --noEmit` for each Next.js app that
  has uncommitted TypeScript changes.

The rules for every change are in [definition-of-done.md](definition-of-done.md).
