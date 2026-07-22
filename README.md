# Playwright Automation Studio

Playwright Automation Studio is a TypeScript monorepo for turning Playwright scripts into maintainable automation assets. Create a script by pasting/uploading it or recording it locally with Playwright Codegen. The studio is AST-first: it uses deterministic **Abstract Syntax Tree (AST)** analysis, framework indexing, governance checks, reuse detection, impact analysis, and confidence scoring. Optional AI provides only a narrow semantic review when it helps; it does not replace local checks or human approval.

The repository is designed around one core rule: Git is the source of truth. Generated page objects, tests, accessibility specs, indexes, and learning data are all visible in the working tree.

## What It Does

- Analyzes uploaded Playwright scripts and extracts workflows, locators, actions, assertions, navigation, and data usage.
- Indexes the existing automation framework under `tests`, `pages`, `components`, `fixtures`, and `utils`.
- Retrieves similar workflows and reusable page objects before proposing new files.
- Applies governance rules for naming, folder placement, locator strategy, accessibility coverage, and raw-locator usage.
- Scores recommendations with confidence bands so risky changes require review.
- Reuses a compatible existing page object when it has safe business and verification methods, rather than creating a duplicate.
- Shows the proposed change scope: files to create/update, related tests, and reused assets.
- Optionally calls a configured AI provider (Gemini or Ollama today) for a narrow semantic decision without sending raw repository code. If it is unavailable or rate-limited, analysis continues with the closest safe local AST/index result and explains the fallback.
- Records approved feedback and outcomes under `storage/learning` to adapt future recommendations.
- Provides a React console and REST API for recording, analysis, approval, execution, failure guidance, learning data, and GitHub pull requests.

## How Codex and GPT-5.6 Were Used

Codex, powered by GPT-5.6, was used as a development collaborator while building this project. It helped inspect the monorepo, design the AST-first workflow, implement the React/Express features, improve the review experience, add Docker/Render deployment support, and verify builds and test flows.

The product itself does **not** require GPT-5.6 at runtime. Its primary analysis and generation path is deterministic and local: it parses Playwright scripts with Abstract Syntax Trees (ASTs), indexes project assets, applies governance rules, and generates proposed files. Optional runtime AI review is provider-configurable (currently Gemini or Ollama), narrowly scoped, and safely falls back to local analysis if unavailable.

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
- Optional: Gemini API key or Ollama running locally if semantic scoring is enabled

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

## Deploy on Render (single frontend + backend service)

This repository includes a single-service [Dockerfile](./Dockerfile) and [Render Blueprint](./render.yaml). The Docker image builds the React application, then the Express API serves both the UI at `/` and API routes under `/api`. It also installs Chromium for Playwright runs.

1. Push the repository to GitHub.
2. In Render, select **New → Blueprint** and choose the repository, or create a **Web Service** with runtime **Docker**.
3. Use `/api/health` as the health-check path. Render supplies `PORT`; the server binds to it automatically.
4. Add `GEMINI_API_KEY` as a Render secret only if you want optional Gemini review, then set `AI_PROVIDER=gemini`. Otherwise leave `AI_PROVIDER=none` for deterministic AST-first operation.
5. For GitHub pull-request creation, add a least-privilege `GH_TOKEN` secret that can push the automation branch and create pull requests for the configured repository. Do not put tokens in the Dockerfile or source code.

The Blueprint attaches a one-GB disk at `/app/storage` for indexes, learning data, uploads, and recording sessions. Generated test/page-object files are intentionally not a durable deployment datastore: approval should create a GitHub pull request and the merge is the durable source of truth. Render’s regular container filesystem is replaced on deploy.

The **URL recording / Playwright Codegen Inspector** flow remains a local-desktop capability. It opens native browser and Inspector windows on the API machine, which a normal Render web service cannot display. On Render, use **Upload or paste a script**, then analyze, preview, test the reviewed proposal, and approve it. Playwright test execution itself works in the Docker container.

## Web Console

The React UI is the main control surface for the platform. It runs at `http://localhost:5173` during local development and connects to the API at `http://localhost:4000` unless `VITE_API_URL` is set.

The sidebar keeps the main workflow to these areas:

| Area | Purpose |
| --- | --- |
| Start Here | See the four-step workflow and choose the next action |
| Create Test | Paste/upload a Playwright script or record a new one from a URL |
| Review & Approve | Review generated files, governance, confidence, reuse, and impact before approval |
| Project Library | Review indexed tests, workflows, page objects, locators, and accessibility assets |
| Run Tests | Run functional/accessibility tests and review the result |
| Git & Pull Requests | Configure GitHub and open or manage the draft pull request created after approval |

Technical diagnostics such as the index, governance detail, generated-file previews, AI review detail, learning history, token analytics, and failure guidance remain available from the relevant workflow actions or existing direct links, but are intentionally not primary navigation items.

The top action bar exposes the primary actions:

- `Analyze` sends the current upload to `/api/analysis/upload`.
- `Run` starts Playwright execution through `/api/execution/run`.
- `Approve files` writes only the reviewed proposal to the repository. When GitHub is configured, it commits those approved files on an `automation/...` branch, pushes it, creates or updates a draft pull request, and returns the local checkout to the default branch.

To create pull requests, install and authenticate GitHub CLI on the machine running the API:

```bash
gh auth login
```

The Git & Pull Requests tab lets users configure the GitHub repository URL, displays diagnostics, and starts GitHub CLI's secure browser sign-in. Saving a repository URL only updates the local Git `origin` remote—it does not upload, commit, or create a pull request. The app deliberately does not accept or store GitHub keys; GitHub CLI stores credentials securely. The project must be on its default branch so the platform can create an isolated branch and avoid committing unrelated worktree files. Later approvals update one unambiguous open Studio draft PR rather than creating another PR. Open the draft PR in GitHub to mark it ready for review, request reviewers, merge it, or close it; the app can also close a draft PR and optionally delete its remote branch.

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
| `AI_PROVIDER` | inferred | `gemini`, `ollama`, or `none`; selects optional semantic review |
| `GEMINI_API_KEY` | none | Gemini key, used only by the API server and never exposed to the browser |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used for semantic decisions |
| `OLLAMA_ENABLED` | `false` | Enables Ollama when `AI_PROVIDER` is not set |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model used for semantic decisions |

Example with Gemini enabled:

```bash
cp .env.example .env
# Edit .env and replace GEMINI_API_KEY with your real key.
npm run dev
```

Example with Ollama enabled:

```bash
OLLAMA_ENABLED=true OLLAMA_MODEL=llama3.1 npm run dev
```

## Gemini and Ollama Configuration

Gemini and Ollama are configured in `packages/core/src/types/config.ts` and used only by the upload analysis route in `apps/api/src/routes/analysis.ts`.

To use Gemini, create `.env` from `.env.example` and set:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash
```

`.env` is ignored by Git. The Gemini key stays on the API machine; it is never returned to the web app, saved in project storage, or committed. Gemini receives the workflow summary, selected local framework metadata, and similarity evidence used for a narrow semantic score—not the raw repository.

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
4. Review the proposal: project rules, change scope, reusable assets, confidence, and optional AI/context information.
5. Choose **Add to PR batch** to stage a reviewed workflow without writing it. Repeat the Create Test and review steps for every workflow you want in the same pull request.
6. Use **Approve batch** when all staged workflows are correct. You can remove a staged workflow before approval.
7. The API writes only approved files into `pages/`, `tests/functional/`, and `tests/accessibility/`, then rebuilds `storage/indexes/framework-index.json`.
8. If GitHub is configured, approval creates or updates one draft pull request containing only those approved files.
9. Run approved tests from **Run Tests** or with `npm run test:e2e`.

## REST API

The API is registered under `/api`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/analysis/upload` | Analyze an uploaded or JSON-submitted Playwright script |
| `POST` | `/api/analysis/feedback` | Record accepted, rejected, or modified feedback |
| `POST` | `/api/analysis/apply` | Apply approved proposed files and rebuild the index |
| `GET` | `/api/index` | Build and return the current framework index |
| `POST` | `/api/index/rebuild` | Force a deterministic re-index |
| `GET` | `/api/governance/report` | Return repository governance findings |
| `POST` | `/api/execution/run` | Run Playwright and return a self-healing proposal on failure |
| `POST` | `/api/recording/sessions` | Start a local Playwright Codegen session from a URL |
| `GET` | `/api/recording/sessions/:id` | Read Codegen recording status and generated source |
| `POST` | `/api/recording/sessions/:id/stop` | Stop the local Codegen session |
| `POST` | `/api/recording/sessions/:id/save` | Stage generated Codegen source for editing and upload |
| `GET` | `/api/git/status` | Return Git status and diff information |
| `POST` | `/api/git/commit` | Commit approved working-tree changes |
| `GET` | `/api/git/pull-request-readiness` | Check GitHub CLI, authentication, remote, and branch prerequisites |
| `POST` | `/api/git/remote` | Add or update the GitHub `origin` remote from an approved repository URL |
| `POST` | `/api/git/auth/login` | Start secure GitHub CLI browser sign-in |
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

- Page objects use `<Workflow>Page.ts` names under `pages/`.
- Components use `<Name>Component.ts` names under `components/`.
- Functional specs live under `tests/functional`.
- Accessibility specs live under `tests/accessibility`.
- Functional tests should call page-object workflows instead of using raw Playwright locators directly.
- Locator preference order is role, label, placeholder, text, test id, CSS, then XPath.
- XPath, dynamic selectors, index selectors, duplicate locators, and ignored reusable assets are flagged.

## Project Rules and Confidence

Project rules are local guardrails, not AI instructions and not a guarantee that the live application works. They check generated file location and naming, keep raw Playwright locators out of functional tests, and flag risky locator patterns. The separate change-scope section shows which repository files the proposal will create, update, or reuse. Running the approved test is still required to validate runtime behavior.

Confidence is a review recommendation, not permission to change files automatically. The UI requires explicit human approval for every write.

| Score | Band | Behavior |
| --- | --- | --- |
| `95-100` | High confidence | Review then approve if correct |
| `80-94` | Review recommended | Review the generated files and scope before approval |
| `60-79` | Caution | Investigate the proposal before approval |
| `0-59` | High risk | Do not approve without manual investigation |

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
