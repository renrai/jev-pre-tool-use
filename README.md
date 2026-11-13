# jev-command-guard

A guard for [Claude Code](https://claude.com/claude-code) that uses **Jev**, the decision model from [TypeSafe AI](https://docs.typesafe.ai), to assess every Bash/PowerShell command **before** it runs. If a command looks dangerous, Claude Code stops and asks for your confirmation, showing why.

```
Claude wants to run:  git reset --hard HEAD~5
                         │
              PreToolUse hook (src/hook.ts)
                         │  1 call, ~100 ms
                         ▼
        Jev answers 6 typed questions in parallel
   category: git (97%) · risk: 2.2/3 · deletes_data: 0.97 ...
                         │
              policy (src/policy.ts)
                         ▼
   ⚠ Confirmation: "Jev: risk 2.2/3 (high) · deletes/overwrites data (97%)"
```

This project exists to **learn how Jev works** through a real use case that runs dozens of times a day while you work.

## Jev in one sentence

A model that **doesn't generate text**: you send a `state` (the data) and typed `questions`, and it returns answers that can only be the options you defined, with probabilities.

| Type | Used here for | Returns |
|---|---|---|
| `choice` | `category`: read_only, build_test, git, package_install, file_change, network, system | chosen option + probability of each |
| `score` | `risk`: scale from 0 (harmless) to 3 (critical) | weighted average, e.g. `2.2` |
| `noul` | `deletes_data`, `sends_data_out`, `touches_secrets`, `runs_remote_code` | probability of "yes", from 0 to 1 |

The questions live in [src/questions.ts](src/questions.ts). The TypeScript SDK infers answer types from them: `answers.category.choice` is already typed as `"read_only" | "build_test" | ...`.

## Design principles

- **It only adds friction, never removes it.** The hook can ask for confirmation (`ask`) or block (`deny`, optional), but it never approves a command on its own. Low-risk commands follow Claude Code's normal permission flow.
- **It fails open.** With no key, no network or an API error, the hook stays silent and Claude Code carries on normally. The error goes to the log.
- **Jev answers, your code decides.** Thresholds live in [guard.config.json](guard.config.json) and the logic in [src/policy.ts](src/policy.ts).

## Installation

Requirements: Node.js 22.18+ (the project runs `.ts` directly, no build step) and a TypeSafe API key.

```bash
npm install
cp .env.example .env   # then add your TYPESAFE_API_KEY
```

Get your key **only from the official TypeSafe console** (see the [Quick start](https://docs.typesafe.ai/introduction/quickstart)).

Try a command by hand:

```bash
npm run try -- "git push --force origin main"
npm run try -- --tool PowerShell "Remove-Item -Recurse -Force C:\temp"
```

The output shows everything Jev returned: the probability of each category, the risk distribution, the flags and the final decision.

## Enabling the hook

**This project only (already configured):** [.claude/settings.json](.claude/settings.json) registers the hook. Open Claude Code in this folder and use it as usual.

**All projects:** add this to your `~/.claude/settings.json`, replacing the path with this folder's:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command", "command": "node \"C:/path/to/jev-use-case/src/hook.ts\"", "timeout": 15 }
        ]
      }
    ]
  }
}
```

The `.env` is read from the project folder, so the key works from any directory.

## Monitoring and tuning

Every decision is recorded in `logs/decisions.jsonl` (ignored by git).

```bash
npm run report        # decisions, categories, p50/p95 latency, tokens and estimated cost
npm run report -- 20  # + the last 20 decisions
```

To measure quality objectively:

```bash
npm run eval
```

The eval runs the guard against [eval/dataset.json](eval/dataset.json), 35 commands hand-labeled as `pass` or `ask`, and reports accuracy, **false negatives** (a dangerous command that got through, the serious error) and **false positives** (a harmless command that asked for confirmation, the annoying error).

### Learning exercises

1. Run `npm run eval` and note the accuracy. Then change `askAtRisk` from `1.5` to `1.0` and to `2.0`. How do false positives and false negatives move?
2. Rewrite the `deletes_data` instruction in [src/questions.ts](src/questions.ts) without the examples in parentheses. Does accuracy drop?
3. Add a new question, for example `noul("command affects files outside cwd")`, use it in the policy and watch the type of `answers` update on its own in your editor.
4. Add to the dataset the real commands from `npm run report` that the guard got wrong.
5. Set `"denyEnabled": true` and watch Claude Code receive the block and try another approach.

## Configuration (`guard.config.json`)

| Field | Default | Effect |
|---|---|---|
| `tools` | `["Bash", "PowerShell"]` | Claude Code tools that get assessed |
| `askAtRisk` | `1.5` | risk (0..3) at which confirmation is requested |
| `flagThreshold` | `0.8` | minimum probability for a yes/no flag to count |
| `denyEnabled` | `false` | if `true`, risk ≥ `denyAtRisk` or remote code execution is blocked |
| `denyAtRisk` | `2.5` | blocking threshold |
| `timeoutMs` | `4000` | per-attempt timeout for the Jev call |

## Structure

```
src/
  questions.ts   the 6 questions for Jev (the project's "prompt")
  classify.ts    SDK client and the systemOne call
  policy.ts      probabilities -> pass / ask / deny
  guard.ts       hook core, testable and free of process I/O
  hook.ts        hook entry point: stdin -> stdout
  log.ts         JSONL log
  cli/try.ts     assess one command and print every probability
  cli/report.ts  log summary
eval/            labeled dataset + evaluation script
test/            tests (node:test) with a fake fetch, no network and no key
```

```bash
npm run check   # typecheck + tests
```

## Privacy

The text of every assessed command (and the folder it runs in) is sent to the TypeSafe API. If your commands contain sensitive data, keep that in mind or narrow the hook with `tools` / `matcher`.

## License

MIT
