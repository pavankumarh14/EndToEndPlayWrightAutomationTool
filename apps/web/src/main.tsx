import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Accessibility,
  Activity,
  ArrowLeft,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Code2,
  FileSearch,
  Gauge,
  GitBranch,
  GraduationCap,
  Play,
  ShieldCheck,
  Upload
} from 'lucide-react';
import { AnalysisResponse, FrameworkIndex, LearningDashboardResponse, apiGet, apiPost, uploadScript } from './api';
import './styles/app.css';

const sample = `import { test, expect } from '@playwright/test';

test('Login', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Dashboard')).toBeVisible();
});`;

type Notice = {
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  visibleOn?: string[];
};

const modules = [
  ['Upload Center', Upload],
  ['Framework Explorer', FileSearch],
  ['Index Dashboard', Activity],
  ['Governance Dashboard', ShieldCheck],
  ['Confidence Dashboard', Gauge],
  ['Functional Tests', Code2],
  ['Accessibility Tests', Accessibility],
  ['Execution Center', Play],
  ['Self-Healing Console', BrainCircuit],
  ['AI Insights', Bot],
  ['Learning Dashboard', GraduationCap],
  ['Token Analytics', Activity],
  ['Git Review Console', GitBranch]
] as const;

const pageRoutes = new Map(modules.map(([label]) => [slugify(label), label]));

function App() {
  const [active, setActive] = useState(() => pageFromHash());
  const [source, setSource] = useState(sample);
  const [analysis, setAnalysis] = useState<AnalysisResponse | undefined>();
  const [index, setIndex] = useState<FrameworkIndex | undefined>();
  const [governance, setGovernance] = useState<AnalysisResponse['governance'] | undefined>();
  const [execution, setExecution] = useState<any>();
  const [git, setGit] = useState<any>();
  const [learning, setLearning] = useState<LearningDashboardResponse | undefined>();
  const [installMissingDependencies, setInstallMissingDependencies] = useState(false);
  const [runAccessibilityWithFunctional, setRunAccessibilityWithFunctional] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    title: 'Start with an upload',
    message: 'Paste a Playwright Codegen script, then click Analyze to generate a reviewed proposal.',
    visibleOn: ['Upload Center']
  });

  useEffect(() => {
    const onHashChange = () => setActive(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    refreshIndex();
    refreshLearning();
    apiGet<AnalysisResponse['governance']>('/api/governance/report').then(setGovernance).catch(() => undefined);
    apiGet('/api/git/status').then(setGit).catch(() => undefined);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(page: string) {
    setActive(page);
    const nextHash = hashForPage(page);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }

  async function refreshIndex() {
    const next = await apiGet<FrameworkIndex>('/api/index');
    setIndex(next);
  }

  async function refreshLearning() {
    const next = await apiGet<LearningDashboardResponse>('/api/learning/dashboard');
    setLearning(next);
  }

  async function analyze() {
    setBusy(true);
    setError(undefined);
    setNotice({
      tone: 'info',
      title: 'Analyzing upload',
      message: 'The API is parsing the script, searching the framework index, checking governance, and scoring confidence.',
      visibleOn: ['Upload Center', 'Confidence Dashboard']
    });
    try {
      const result = await uploadScript(source);
      setAnalysis(result);
      setGovernance(result.governance);
      setNotice({
        tone: 'success',
        title: 'Analysis complete',
        message: 'Review the confidence evidence, preview generated files, then approve only if the proposal is acceptable.',
        visibleOn: ['Confidence Dashboard', 'Functional Tests', 'Accessibility Tests', 'AI Insights']
      });
      navigate('Confidence Dashboard');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Analysis failed', message, visibleOn: ['Upload Center', 'Confidence Dashboard'] });
    } finally {
      setBusy(false);
    }
  }

  async function applyChange() {
    if (!analysis) return;
    setBusy(true);
    setNotice({
      tone: 'info',
      title: 'Applying approved proposal',
      message: 'Generated files are being written to the repository and the framework index is being rebuilt.',
      visibleOn: ['Confidence Dashboard', 'Git Review Console']
    });
    try {
      await apiPost('/api/analysis/apply', { files: analysis.proposedChange.files, approved: true });
      await refreshIndex();
      await refreshLearning();
      setGit(await apiGet('/api/git/status').catch(() => undefined));
      setNotice({
        tone: 'success',
        title: 'Proposal applied',
        message: 'Review the Git status. New untracked files appear in status; tracked file edits appear in the diff panel.',
        visibleOn: ['Git Review Console']
      });
      navigate('Git Review Console');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Approve failed', message, visibleOn: ['Confidence Dashboard', 'Git Review Console'] });
    } finally {
      setBusy(false);
    }
  }

  async function sendFeedback(action: 'accepted' | 'rejected' | 'modified') {
    if (!analysis) return;
    await apiPost('/api/analysis/feedback', {
      source: 'user-suggestion',
      action,
      recommendationType: analysis.proposedChange.kind,
      originalRecommendation: analysis.proposedChange.auditSummary,
      finalOutcome: action === 'rejected' ? 'User rejected generated recommendation' : 'User reviewed recommendation',
      executionResult: 'unknown',
      confidenceScore: analysis.confidence.score,
      patterns: collectPatterns(analysis),
      approved: action !== 'rejected'
    });
    await refreshLearning();
    if (action === 'modified') {
      setNotice({
        tone: 'info',
        title: 'Modify feedback recorded',
        message: 'You are back in Upload Center. Edit the script and click Analyze again to create a new proposal.',
        visibleOn: ['Upload Center']
      });
      navigate('Upload Center');
      return;
    }
    setNotice({
      tone: action === 'accepted' ? 'success' : 'warning',
      title: action === 'accepted' ? 'Feedback accepted' : 'Proposal rejected',
      message:
        action === 'accepted'
          ? 'The decision was recorded for learning. Use Approve when you are ready to write files to the repository.'
          : 'The rejection was recorded for learning. No files were written; edit the upload or analyze a different script.',
      visibleOn: ['Confidence Dashboard', 'Learning Dashboard']
    });
  }

  async function runTests() {
    setBusy(true);
    setNotice({
      tone: 'info',
      title: 'Running Playwright',
      message: runAccessibilityWithFunctional
        ? 'Executing Playwright with accessibility checkpoints during the functional workflow.'
        : 'Executing command: npx playwright test',
      visibleOn: ['Execution Center']
    });
    try {
      setExecution(await apiPost('/api/execution/run', { installMissingDependencies, runAccessibilityWithFunctional }));
      setNotice({
        tone: 'success',
        title: 'Run finished',
        message: 'Execution Center shows the Playwright result and logs. If it failed, open Self-Healing Console for the proposal.',
        visibleOn: ['Execution Center', 'Self-Healing Console']
      });
      navigate('Execution Center');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Run failed to start', message, visibleOn: ['Execution Center'] });
    } finally {
      setBusy(false);
    }
  }

  const stats = index?.tokenStats;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={24} />
          <span>Playwright AI Control</span>
        </div>
        <nav>
          {modules.map(([label, Icon]) => (
            <button className={active === label ? 'active' : ''} key={label as string} onClick={() => navigate(label as string)}>
              <Icon size={18} />
              <span>{label as string}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <h1>{active}</h1>
            <p>{pageDescription(active, analysis, execution)}</p>
          </div>
          <div className="actions">
            <button onClick={analyze} disabled={busy}><Upload size={16} />Analyze</button>
            <button onClick={runTests} disabled={busy}><Play size={16} />Run</button>
            <button onClick={applyChange} disabled={busy || !analysis}><CheckCircle2 size={16} />Approve</button>
            <label className="run-option">
              <input
                type="checkbox"
                checked={installMissingDependencies}
                onChange={(event) => setInstallMissingDependencies(event.target.checked)}
                disabled={busy}
              />
              <span>Install missing deps</span>
            </label>
            <label className="run-option">
              <input
                type="checkbox"
                checked={runAccessibilityWithFunctional}
                onChange={(event) => setRunAccessibilityWithFunctional(event.target.checked)}
                disabled={busy}
              />
              <span>A11y with functional</span>
            </label>
          </div>
        </header>
        {error && <div className="alert">{error}</div>}
        <section className="content">
          {shouldShowNotice(notice, active) && <NoticeBanner notice={notice} />}
          {active === 'Upload Center' && <UploadCenter source={source} setSource={setSource} />}
          {active === 'Framework Explorer' && <Explorer index={index} />}
          {active === 'Index Dashboard' && <IndexDashboard index={index} />}
          {active === 'Governance Dashboard' && <Governance report={governance} />}
          {active === 'Confidence Dashboard' && (
            <Confidence
              analysis={analysis}
              sendFeedback={sendFeedback}
              setActive={navigate}
              approve={applyChange}
              busy={busy}
            />
          )}
          {active === 'Functional Tests' && (
            <GeneratedFiles
              analysis={analysis}
              filter="tests/functional"
              setActive={navigate}
              emptyLabel="Analyze an upload to preview generated functional tests."
            />
          )}
          {active === 'Accessibility Tests' && (
            <GeneratedFiles
              analysis={analysis}
              filter="tests/accessibility"
              setActive={navigate}
              emptyLabel="Analyze an upload to preview generated accessibility tests."
            />
          )}
          {active === 'Execution Center' && <Execution execution={execution} />}
          {active === 'Self-Healing Console' && <Healing execution={execution} />}
          {active === 'AI Insights' && <AiInsights analysis={analysis} />}
          {active === 'Learning Dashboard' && <LearningDashboard learning={learning} />}
          {active === 'Token Analytics' && <TokenAnalytics stats={stats} />}
          {active === 'Git Review Console' && <GitReview git={git} />}
        </section>
      </main>
    </div>
  );
}

function UploadCenter(props: { source: string; setSource: (value: string) => void }) {
  return (
    <div className="workspace">
      <div className="panel wide">
        <h2>Codegen Script</h2>
        <textarea value={props.source} onChange={(event) => props.setSource(event.target.value)} spellCheck={false} />
      </div>
      <div className="panel">
        <h2>Processing Model</h2>
        <Metric label="Deterministic target" value="95%" />
        <Metric label="AI reasoning target" value="5%" />
        <Metric label="Raw code to AI" value="Never" />
      </div>
    </div>
  );
}

function Explorer({ index }: { index?: FrameworkIndex }) {
  return <Grid items={[
    ['Tests', index?.tests.length ?? 0],
    ['Workflows', index?.workflows.length ?? 0],
    ['Page Objects', index?.pageObjects.length ?? 0],
    ['Locators', index?.locators.length ?? 0],
    ['Accessibility', index?.accessibility.length ?? 0]
  ]} />;
}

function IndexDashboard({ index }: { index?: FrameworkIndex }) {
  return (
    <div className="workspace">
      <div className="panel">
        <h2>Repository Index</h2>
        <Metric label="Generated" value={index?.generatedAt ? new Date(index.generatedAt).toLocaleString() : 'Pending'} />
        <Metric label="Indexed files" value={String(index?.tokenStats.indexedFiles ?? 0)} />
        <Metric label="Processing time" value={`${index?.tokenStats.processingTimeMs ?? 0} ms`} />
      </div>
      <div className="panel wide">
        <h2>Indexes</h2>
        <Grid items={[
          ['Test Index', index?.tests.length ?? 0],
          ['Workflow Index', index?.workflows.length ?? 0],
          ['Page Object Index', index?.pageObjects.length ?? 0],
          ['Locator Index', index?.locators.length ?? 0],
          ['Accessibility Index', index?.accessibility.length ?? 0]
        ]} />
      </div>
    </div>
  );
}

function Governance({ report }: { report?: AnalysisResponse['governance'] }) {
  return (
    <div className="panel wide">
      <h2>{report?.passed ? 'Governance Passed' : 'Governance Findings'}</h2>
      <Table rows={(report?.violations ?? []).map((v) => [v.severity, v.rule, v.message, v.filePath ?? ''])} />
    </div>
  );
}

function Confidence({
  analysis,
  sendFeedback,
  setActive,
  approve,
  busy
}: {
  analysis?: AnalysisResponse;
  sendFeedback: (action: 'accepted' | 'rejected' | 'modified') => Promise<void>;
  setActive: (value: string) => void;
  approve: () => Promise<void>;
  busy: boolean;
}) {
  if (!analysis) return <Empty label="Analyze an upload to populate confidence scoring." />;
  const learningRows = analysis.confidence.learningInfluence?.factors.map((factor) => [
    factor.name,
    `${factor.adjustment > 0 ? '+' : ''}${factor.adjustment}`,
    factor.evidence
  ]) ?? [];
  return (
    <div className="workspace">
      <div className="panel">
        <h2>Decision</h2>
        <div className={`score ${analysis.confidence.band}`}>{analysis.confidence.score}%</div>
        <Metric label="Band" value={analysis.confidence.band} />
        <Metric label="Base score" value={`${analysis.confidence.learningInfluence?.originalScore ?? analysis.confidence.score}%`} />
        <Metric label="Learning adjustment" value={`${analysis.confidence.learningInfluence?.adjustment ?? 0}`} />
        <p>{analysis.confidence.reasoningSummary}</p>
        <div className="next-actions">
          <button onClick={() => setActive('Upload Center')}><ArrowLeft size={16} />Edit Upload</button>
          <button onClick={() => setActive('Functional Tests')}>Preview Functional</button>
          <button onClick={() => setActive('Accessibility Tests')}>Preview A11y</button>
          <button className="primary" onClick={approve} disabled={busy}><CheckCircle2 size={16} />Approve Files</button>
        </div>
        <p className="helper-text">Feedback changes learning data only. Approve writes the proposed files to the repository.</p>
        <div className="feedback-actions">
          <button onClick={() => sendFeedback('accepted')}>Accept</button>
          <button onClick={() => sendFeedback('modified')}>Modify</button>
          <button onClick={() => sendFeedback('rejected')}>Reject</button>
        </div>
      </div>
      <div className="panel wide">
        <h2>Evidence</h2>
        <Table rows={[
          ...Object.entries(analysis.confidence.similarityMetrics).map(([k, v]) => [k, String(v)]),
          ...analysis.confidence.retrievedAssetsUsed.map((asset) => ['asset', asset])
        ]} />
        <h2>Learning Influence</h2>
        <Table rows={learningRows} />
      </div>
    </div>
  );
}

function GeneratedFiles({
  analysis,
  filter,
  setActive,
  emptyLabel
}: {
  analysis?: AnalysisResponse;
  filter: string;
  setActive: (value: string) => void;
  emptyLabel: string;
}) {
  const files = analysis?.proposedChange.files.filter((file) => file.path.startsWith(filter)) ?? [];
  return (
    <div className="stack">
      <div className="panel">
        <div className="section-header">
          <div>
            <h2>Generated File Preview</h2>
            <p className="helper-text">These files have not been written yet. Use Approve from the Confidence Dashboard to apply them.</p>
          </div>
          <button onClick={() => setActive('Confidence Dashboard')}><ArrowLeft size={16} />Back to Confidence</button>
        </div>
      </div>
      {files.length ? files.map((file) => <CodePanel key={file.path} title={file.path} code={file.content} />) : <Empty label={emptyLabel} />}
    </div>
  );
}

function Execution({ execution }: { execution: any }) {
  const installSummary = execution?.result.installActions?.length
    ? execution.result.installActions.map((action: any) => `${action.command}: ${action.success ? 'installed' : 'failed'}`).join('\n')
    : 'No dependency install attempted.';

  return (
    <div className="panel wide">
      <h2>Run Result</h2>
      <Metric label="Command" value="npx playwright test" />
      <Metric label="Status" value={execution ? (execution.result.passed ? 'Passed' : 'Failed') : 'Not run'} />
      <Metric label="Functional a11y" value={execution?.result.accessibilityWithFunctional ? 'Enabled' : 'Disabled'} />
      <Metric label="Dependency retry" value={execution?.result.retried ? 'Yes' : 'No'} />
      <pre>{installSummary}</pre>
      <pre>{execution?.result.logs ?? 'Run tests to collect logs, screenshots, videos, traces, and root cause analysis.'}</pre>
    </div>
  );
}

function Healing({ execution }: { execution: any }) {
  return (
    <div className="panel wide">
      <h2>Healing Proposal</h2>
      {execution?.healing ? (
        <>
          <Metric label="Confidence" value={`${execution.healing.confidence.score}%`} />
          <p>{execution.healing.rootCause}</p>
          <pre>{execution.healing.proposedFix}</pre>
        </>
      ) : <Empty label="No failing execution evidence available." />}
    </div>
  );
}

function AiInsights({ analysis }: { analysis?: AnalysisResponse }) {
  return (
    <div className="panel wide">
      <h2>AI Boundary</h2>
      <Table rows={[
        ['Context sent', analysis ? 'Workflow summary, retrieved assets, similarity metrics' : 'None'],
        ['Raw repository', 'Blocked'],
        ['Raw code embeddings', 'Blocked'],
        ['Retrieved token estimate', String(analysis?.retrieval.tokenEstimate ?? 0)]
      ]} />
    </div>
  );
}

function LearningDashboard({ learning }: { learning?: LearningDashboardResponse }) {
  if (!learning) return <Empty label="Learning profile has not been generated yet." />;
  return (
    <div className="stack">
      <div className="grid">
        <Metric label="Preferred locator" value={learning.profile.preferredLocatorStrategy} />
        <Metric label="Preferred assertion" value={learning.profile.preferredAssertionStyle} />
        <Metric label="Page object pattern" value={learning.profile.preferredPageObjectPattern} />
        <Metric label="Accessibility rules" value={learning.profile.preferredAccessibilityRules} />
        <Metric label="Self-healing success" value={`${learning.selfHealingSuccessRate}%`} />
        <Metric label="Accepted decisions" value={String(learning.profile.historicalOutcomes.accepted)} />
      </div>
      <div className="workspace">
        <div className="panel wide">
          <h2>Most Accepted Recommendations</h2>
          <Table rows={learning.mostAcceptedRecommendations.map((item) => [item.pattern, String(item.count), `${item.acceptanceRate}%`])} />
        </div>
        <div className="panel wide">
          <h2>Most Rejected Recommendations</h2>
          <Table rows={learning.mostRejectedRecommendations.map((item) => [item.pattern, String(item.count), `${item.acceptanceRate}%`])} />
        </div>
      </div>
      <div className="workspace">
        <div className="panel wide">
          <h2>Confidence Accuracy Trends</h2>
          <Table rows={learning.confidenceAccuracyTrends.map((item) => [item.bucket, `${item.acceptanceRate}%`, `${item.count} decisions`])} />
        </div>
        <div className="panel wide">
          <h2>Top Team Standards</h2>
          <Table rows={learning.topTeamStandards.map((standard) => [standard])} />
        </div>
      </div>
    </div>
  );
}

function TokenAnalytics({ stats }: { stats?: FrameworkIndex['tokenStats'] }) {
  return <Grid items={[
    ['Repository size', `${stats?.repositorySizeBytes ?? 0} bytes`],
    ['Indexed files', stats?.indexedFiles ?? 0],
    ['Tokens before retrieval', stats?.estimatedTokensBeforeRetrieval ?? 0],
    ['Tokens after retrieval', stats?.estimatedTokensAfterRetrieval ?? 0],
    ['Token reduction', `${stats?.tokenReductionPercent ?? 100}%`],
    ['Processing time', `${stats?.processingTimeMs ?? 0} ms`]
  ]} />;
}

function GitReview({ git }: { git: any }) {
  return (
    <div className="workspace">
      <CodePanel title="Status" code={git?.status ?? 'Git repository is not initialized.'} />
      <CodePanel title="Diff for tracked files" code={git?.diff || 'No tracked-file diff available. New files appear in Git status until they are staged or committed.'} />
    </div>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <div className={`notice ${notice.tone}`}>
      <strong>{notice.title}</strong>
      <span>{notice.message}</span>
    </div>
  );
}

function shouldShowNotice(notice: Notice, active: string): boolean {
  return !notice.visibleOn || notice.visibleOn.includes(active);
}

function pageFromHash(hash = window.location.hash): string {
  const key = hash.replace(/^#\/?/, '');
  return pageRoutes.get(key) ?? 'Upload Center';
}

function hashForPage(page: string): string {
  return `#/${slugify(page)}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function pageDescription(active: string, analysis?: AnalysisResponse, execution?: any): string {
  if (active === 'Upload Center') return 'Edit the Playwright script here, then click Analyze to create a proposal.';
  if (active === 'Confidence Dashboard') {
    return analysis
      ? 'Review the proposal confidence, preview generated files, then approve or send feedback.'
      : 'Analyze an upload first to populate this dashboard.';
  }
  if (active === 'Execution Center') {
    return execution ? 'Playwright execution output from npx playwright test.' : 'Click Run to execute the Playwright test suite.';
  }
  if (active === 'Git Review Console') return 'Review repository status after approved files are written.';
  if (active === 'Learning Dashboard') return 'Review feedback patterns learned from accepted, modified, and rejected recommendations.';
  return 'AST-first automation governance for enterprise Playwright repositories.';
}

function collectPatterns(analysis: AnalysisResponse): string[] {
  const haystack = [
    analysis.proposedChange.auditSummary,
    ...analysis.proposedChange.files.map((file) => `${file.path}\n${file.content}`)
  ].join('\n');
  const patterns = new Set<string>();
  if (/pages\//.test(haystack)) patterns.add('page-object:action-plus-verification-methods');
  if (/tests\/functional/.test(haystack)) patterns.add('test:business-workflow-only');
  if (/tests\/accessibility/.test(haystack)) patterns.add('accessibility:wcag-2.1-aa');
  if (/getByRole/.test(haystack)) patterns.add('locator:getByRole');
  if (/getByLabel/.test(haystack)) patterns.add('locator:getByLabel');
  if (/getByText/.test(haystack)) patterns.add('locator:getByText');
  if (/toBeVisible/.test(haystack)) patterns.add('assertion:expect(locator).toBeVisible');
  return [...patterns];
}

function Grid({ items }: { items: Array<[string, string | number]> }) {
  return <div className="grid">{items.map(([label, value]) => <Metric key={label} label={label} value={String(value)} />)}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Table({ rows }: { rows: Array<Array<string>> }) {
  return <div className="table">{rows.length ? rows.map((row, i) => <div className="row" key={i}>{row.map((cell, j) => <span key={j}>{cell}</span>)}</div>) : <Empty label="No findings." />}</div>;
}

function CodePanel({ title, code }: { title: string; code: string }) {
  return <div className="panel wide"><h2>{title}</h2><pre>{code}</pre></div>;
}

function Empty({ label }: { label: string }) {
  return <div className="empty">{label}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
