# Enterprise AI Playwright Platform

Enterprise AI Playwright Platform is a TypeScript monorepo for turning uploaded Playwright Codegen scripts into maintainable automation assets. It uses deterministic AST analysis, framework indexing, governance checks, confidence scoring, optional Ollama semantic review, and explicit human approval before writing generated files back to the repository.

The repository is designed around one core rule: Git is the source of truth. Generated page objects, tests, accessibility specs, indexes, and learning data are all visible in the working tree.

## What It Does

- Analyzes uploaded Playwright scripts and extracts workflows, locators, actions, assertions, navigation, and data usage.
- Indexes the existing automation framework under `tests`, `pages`, `components`, `fixtures`, and `utils`.
- Retrieves similar workflows and reusable page objects before proposing new files.
- Applies governance rules for naming, folder placement, locator strategy, accessibility coverage, and raw-locator usage.
- Scores recommendations with confidence bands so risky changes require review.
- Optionally calls Ollama for narrow semantic decisions without sending raw repository code.
- Records approved feedback and outcomes under `storage/learning` to adapt future recommendations.
- Provides a React console and REST API for upload analysis, approval, execution, self-healing proposals, learning dashboards, Git review, and token analytics.

## Repository Layout

```text
apps/
  api/                 Express REST API and orchestration routes
  web/                 React operations console built with Vite
packages/
  core/                AST analysis, indexing, retrieval, governance, confidence, learning, execution, and generation engines
tests/
  functional/          Generated or hand-authored Playwright functional specs
  accessibility/       Generated or hand-authored accessibility specs
pages/                 Page objects that own locators, actions, and assertions
components/            Reusable component objects
fixtures/              Test fixtures and typed data factories
utils/                 Shared automation utilities
storage/
  indexes/             Generated framework index
  learning/            Learning profile and eligible feedback events
docs/                  Architecture, low-level design, and flow diagrams
```

## Prerequisites

- Node.js 20 or later
- npm
- Playwright browsers, installed with `npx playwright install`
- Optional: Ollama running locally if semantic scoring is enabled

## Setup

```bash
npm install
npx playwright install
```

## Run Locally

Start the API and web console together:

```bash
npm run dev
```

By default:

- API: `http://localhost:4000`
- Web console: `http://localhost:5173`

Use `http://localhost:4000/api/health` to verify the backend is running. The API root at `http://localhost:4000/` returns a short JSON service summary; the browser UI runs separately on `http://localhost:5173`.

The web app reads `VITE_API_URL` and falls back to `http://localhost:4000`.

## Web Console

The React UI is the main control surface for the platform. It runs at `http://localhost:5173` during local development and connects to the API at `http://localhost:4000` unless `VITE_API_URL` is set.

The sidebar organizes the workflow into these areas:

| Area | Purpose |
| --- | --- |
| Upload Center | Paste or upload a Playwright Codegen script and start analysis |
| Codegen Recording | Enter a URL in Upload Center to launch a local browser and Playwright Inspector, edit the recorded script, then save and upload it for analysis |
| Framework Explorer | Review indexed tests, workflows, page objects, locators, and accessibility assets |
| Index Dashboard | Inspect index generation time, indexed file counts, and repository scan output |
| Governance Dashboard | Review naming, folder, locator, accessibility, duplicate, and architecture findings |
| Confidence Dashboard | Review confidence score, evidence, retrieval results, and learning influence |
| Functional Tests | Preview generated functional test files from the latest analysis |
| Accessibility Tests | Preview generated accessibility specs from the latest analysis |
| Execution Center | Run Playwright tests and inspect execution results |
| Self-Healing Console | Review proposed fixes when execution fails |
| AI Insights | Inspect optional semantic review output when Ollama is enabled |
| Learning Dashboard | View accepted/rejected patterns, team standards, and confidence trends |
| Token Analytics | Compare estimated repository token cost before and after retrieval |
| Git & Pull Request | Check GitHub readiness, review local changes, and see the draft pull request created after approval |

The top action bar exposes the primary actions:

- `Analyze` sends the current upload to `/api/analysis/upload`.
- `Run` starts Playwright execution through `/api/execution/run`.
- `Approve` writes the latest approved proposal to the repository, commits only its generated files on a new `automation/...` branch, pushes it, and creates a draft GitHub pull request.

To create pull requests, install and authenticate GitHub CLI on the machine running the API:

```bash
gh auth login
```

The Git & Pull Request tab lets users configure the GitHub repository URL, displays diagnostics, and starts GitHub CLI's secure browser sign-in. It deliberately does not accept or store GitHub keys; GitHub CLI stores credentials securely. The project must be on its default branch so the platform can create an isolated branch and avoid committing unrelated worktree files.

On first load, the Upload Center shows a sample Playwright login script and two intake paths:

1. Upload or paste an existing script and click `Analyze`.
2. Enter a URL, click `Start recording`, complete the workflow in the native Playwright browser and Inspector windows, edit the recorded source in the console, and click `Save & Upload`.

Codegen launches on the same desktop machine as the API. The generated script is staged under `storage/codegen-sessions` and is not written into the automation framework until the normal proposal approval step.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API server port |
| `REPOSITORY_ROOT` | repo root inferred from API workspace | Repository to scan and modify |
| `VITE_API_URL` | `http://localhost:4000` | API base URL used by the React app |
| `OLLAMA_ENABLED` | `false` | Enables optional semantic review when set to `true` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model used for semantic decisions |

Example with Ollama enabled:

```bash
OLLAMA_ENABLED=true OLLAMA_MODEL=llama3.1 npm run dev
```

## Ollama LLM Configuration

Ollama is configured in `packages/core/src/types/config.ts` and used by the upload analysis route in `apps/api/src/routes/analysis.ts`.

By default, Ollama is disabled:

```ts
enabled: process.env.OLLAMA_ENABLED === 'true'
```

When enabled, the API calls:

```text
http://localhost:11434/api/generate
```

with the configured model, which defaults to `llama3.1`.

To run with Ollama locally:

```bash
ollama serve
ollama pull llama3.1
OLLAMA_ENABLED=true OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 npm run dev
```

The Ollama call is only used for narrow semantic scoring during upload analysis. Deterministic parsing, locator extraction, framework indexing, governance checks, and file generation still run without Ollama.

## Common Commands

```bash
npm run dev          # Start API and web console
npm run build        # Build all workspaces
npm run typecheck    # Type-check all workspaces
npm run lint         # Run ESLint
npm run format       # Format the repository with Prettier
npm run test:e2e     # Run Playwright tests from ./tests
npm run index        # Build and persist the framework index
```

## Main Workflow

1. Start the app with `npm run dev`.
2. Open the web console at `http://localhost:5173`.
3. Paste or upload a Playwright Codegen script in the Upload Center.
4. Review parsed workflow details, retrieved assets, governance results, confidence score, and proposed files.
5. Approve the generated change when the recommendation is acceptable.
6. The API writes approved files into `pages/`, `tests/functional/`, and `tests/accessibility/`, then rebuilds `storage/indexes/framework-index.json`.
7. Run tests from the Execution Center or with `npm run test:e2e`.
8. Review Git status and commit approved changes through the Git review flow or your normal Git workflow.

## REST API

The API is registered under `/api`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/analysis/upload` | Analyze an uploaded or JSON-submitted Playwright script |
| `POST` | `/api/analysis/feedback` | Record accepted, rejected, or modified feedback |
| `POST` | `/api/analysis/apply` | Apply approved proposed files and rebuild the index |
| `GET` | `/api/index` | Load or build the framework index |
| `POST` | `/api/index/rebuild` | Force a deterministic re-index |
| `GET` | `/api/governance/report` | Return repository governance findings |
| `POST` | `/api/execution/run` | Run Playwright and return a self-healing proposal on failure |
| `GET` | `/api/git/status` | Return Git status and diff information |
| `POST` | `/api/git/commit` | Commit approved working-tree changes |
| `GET` | `/api/git/pull-request-readiness` | Check GitHub CLI, authentication, remote, and branch prerequisites |
| `POST` | `/api/git/remote` | Add or update the GitHub `origin` remote from an approved repository URL |
| `POST` | `/api/git/pull-request` | Create a draft PR from explicitly approved generated files |
| `POST` | `/api/git/pull-request/close` | Close a draft PR, with an optional confirmed remote-branch deletion |
| `GET` | `/api/learning/profile` | Return the current team automation profile |
| `GET` | `/api/learning/dashboard` | Return learning dashboard metrics |
| `GET` | `/api/learning/events` | Return eligible learning event history |

Example JSON upload:

```bash
curl -X POST http://localhost:4000/api/analysis/upload \
  -H 'content-type: application/json' \
  -d '{"fileName":"login.spec.ts","source":"import { test, expect } from \"@playwright/test\";"}'
```

## Governance Rules

- Page objects use `LoginPage.ts` style names under `pages/`.
- Components use `HeaderComponent.ts` style names under `components/`.
- Functional specs live under `tests/functional`.
- Accessibility specs live under `tests/accessibility`.
- Functional tests should call page-object workflows instead of using raw Playwright locators directly.
- Locator preference order is role, label, placeholder, text, test id, CSS, then XPath.
- XPath, dynamic selectors, index selectors, duplicate locators, and ignored reusable assets are flagged.

## Confidence Bands

| Score | Band | Behavior |
| --- | --- | --- |
| `95-100` | Auto | Safe for automatic application with audit trail |
| `80-94` | Approval | Proposed change requires human approval |
| `60-79` | Recommendation | Explain options without modifying code |
| `0-59` | High Risk | Manual review only |

## Generated Data

- `storage/indexes/framework-index.json` stores the deterministic framework index.
- `storage/learning/events.json` stores eligible approved learning events.
- `storage/learning/team-profile.json` stores the derived team automation profile.
- Uploaded files may be staged under `storage/uploads`.

These files are intentionally visible so the platform remains auditable.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Low-Level Design](docs/LOW_LEVEL_DESIGN.md)
- [Upload Flow](docs/diagrams/upload-flow.md)
- [Self-Healing Flow](docs/diagrams/self-healing-flow.md)
