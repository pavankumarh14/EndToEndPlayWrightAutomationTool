# Playwright Automation Studio Architecture

## Mission

The platform converts uploaded or locally recorded Playwright Codegen scripts into maintainable TypeScript automation assets using an AST-first pipeline with optional focused AI review. Git remains the source of truth; generated automation code is written to the repository, never to a database.

## Architectural Principles

1. AST First. AI Last.
2. Git Repository is the Source of Truth.
3. Deterministic Analysis Before AI.
4. Reuse Before Create.
5. Update Before Duplicate.
6. Governance Before Generation.
7. Confidence Before Modification.
8. Human Approval Before Risky Changes.
9. Accessibility By Default.
10. Enterprise Maintainability Over Fast Generation.
11. Minimize Token Consumption.

## System Modules

| Module | Responsibility |
| --- | --- |
| React Console | Guides creation, review/approval, project-library inspection, test execution, and GitHub pull-request management |
| REST API | Coordinates Codegen recording, indexing, deterministic analysis, retrieval, optional AI review, quality gates, execution, and GitHub CLI |
| Framework Indexer | Scans `tests`, `pages`, `components`, `fixtures`, and `utils` |
| AST Analysis Engine | Extracts locators, methods, tests, assertions, workflows, waits, navigation, and data usage deterministically |
| Retrieval Engine | Sends only relevant workflow, page object, test, and locator summaries into decision flow |
| Similarity Engine | Deterministic lexical similarity for reuse and duplicate detection |
| Reuse Selector | Reuses only compatible page objects with safe no-argument business and verification methods |
| Governance Engine | Enforces naming, folder, locator, accessibility, and raw-locator rules |
| Impact Analyzer | Reports proposed created/updated files, related tests, reused assets, and source-level risk before files are written |
| Confidence Engine | Converts evidence into confidence bands and allowed actions |
| Semantic Provider Integration | Optional Gemini or Ollama semantic reviewer for narrow decisions only; safe local fallback when unavailable |
| Quality Gate | Blocks changes that fail confidence, governance, accessibility, duplicate, and architecture rules |
| Self-Healing Engine | Uses logs and artifacts to propose rule-based, indexed, then AI-scored fixes |
| Git Service | Configures GitHub remote, creates/updates draft PRs for approved files, and manages draft PR closure |
| Framework Learning Engine | Learns from approved decisions, merged outcomes, successful executions, and team patterns |

## Data Boundaries

Automation source is stored only in Git-managed files. Runtime indexes and audit records may be stored as JSON under `storage/`, and can later be backed by SQLite for analytics. Embeddings must only be generated for workflow intent, business purpose, and semantic summaries, never raw repository code.

## Confidence Actions

| Score | Band | Allowed Action |
| --- | --- | --- |
| 95-100 | High confidence | Generate a proposal for human review; explicit approval is still required |
| 80-94 | Approval | Generate proposed change and require human approval |
| 60-79 | Recommendation | Explain options; no code modification |
| 0-59 | High Risk | Manual review only; automated actions disabled |

## Framework Learning Engine

The learning engine turns accepted team behavior into a Team Automation Profile. It captures accepted, rejected, and modified recommendations; self-healing decisions; governance overrides; review feedback; execution outcomes; and historical confidence scores.

Learning is intentionally gated. The system does not learn from temporary failures, unapproved changes, failed executions, failed experimental branches, or unmerged pull-request feedback. Eligible events are stored under `storage/learning` as audit-friendly JSON.

Adaptive confidence is calculated from:

- Base similarity score
- Historical acceptance rate
- Governance compliance
- Previous success rate
- Team preference alignment
- Execution success history

Every adjusted recommendation includes the original score, final score, adjustment factors, standards applied, and historical patterns that influenced the result.

## Token Optimization Strategy

The indexer estimates full-repository token cost and compares it with retrieved workflow summaries. API calls to an optional semantic provider receive only workflow summary, retrieved assets, similarity metrics, and relevant page/test summaries. Raw repository source is not sent. If the provider errors or is quota/rate limited, the system records the warning and proceeds using the closest safe local result.
