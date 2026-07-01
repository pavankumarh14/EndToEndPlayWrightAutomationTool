# Enterprise AI-Assisted Playwright Automation Platform

## Mission

The platform converts uploaded Playwright Codegen scripts into maintainable TypeScript automation assets using an AST-first, AI-last pipeline. Git remains the source of truth; generated automation code is written to the repository, never to a database.

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
| React Console | Uploads scripts, shows indexes, governance, confidence, execution, healing, token analytics, Git review |
| REST API | Coordinates indexing, deterministic analysis, retrieval, Ollama, quality gates, execution, Git |
| Framework Indexer | Scans `tests`, `pages`, `components`, `fixtures`, and `utils` |
| AST Analysis Engine | Extracts locators, methods, tests, assertions, workflows, waits, navigation, and data usage deterministically |
| Retrieval Engine | Sends only relevant workflow, page object, test, and locator summaries into decision flow |
| Similarity Engine | Deterministic lexical similarity for reuse and duplicate detection |
| Governance Engine | Enforces naming, folder, locator, accessibility, and raw-locator rules |
| Confidence Engine | Converts evidence into confidence bands and allowed actions |
| Ollama Integration | Optional semantic reviewer for narrow decisions only |
| Quality Gate | Blocks changes that fail confidence, governance, accessibility, duplicate, and architecture rules |
| Self-Healing Engine | Uses logs and artifacts to propose rule-based, indexed, then AI-scored fixes |
| Git Service | Shows diff/status and commits approved framework changes |
| Framework Learning Engine | Learns from approved decisions, merged outcomes, successful executions, and team patterns |

## Data Boundaries

Automation source is stored only in Git-managed files. Runtime indexes and audit records may be stored as JSON under `storage/`, and can later be backed by SQLite for analytics. Embeddings must only be generated for workflow intent, business purpose, and semantic summaries, never raw repository code.

## Confidence Actions

| Score | Band | Allowed Action |
| --- | --- | --- |
| 95-100 | Auto | Auto apply, update, refactor, create, or heal with audit trail and diff |
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

The indexer estimates full-repository token cost and compares it with retrieved workflow summaries. API calls to Ollama receive only workflow summary, retrieved assets, similarity metrics, and relevant page/test summaries.
