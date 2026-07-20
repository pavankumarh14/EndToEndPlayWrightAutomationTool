import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Accessibility,
  Activity,
  ArrowLeft,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  Code2,
  FileSearch,
  Gauge,
  GitBranch,
  GraduationCap,
  Play,
  ShieldCheck,
  Upload
} from 'lucide-react';
import {
  AnalysisResponse,
  ClosedPullRequest,
  FrameworkIndex,
  LearningDashboardResponse,
  CreatedPullRequest,
  PullRequestReadiness,
  RecordingSession,
  apiGet,
  apiPost,
  closePullRequest as closeGitHubPullRequest,
  createPullRequest,
  getRecording,
  getPullRequestReadiness,
  saveRecording,
  setGitRemote,
  startGitHubLogin,
  startRecording,
  stopRecording,
  uploadScript
} from './api';
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
  ['Getting Started', CircleHelp],
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
  ['Git & Pull Request', GitBranch]
] as const;

const pageRoutes = new Map(modules.map(([label]) => [slugify(label), label]));

function App() {
  const [active, setActive] = useState(() => pageFromHash());
  const [source, setSource] = useState(sample);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recording, setRecording] = useState<RecordingSession | undefined>();
  const [recordingSource, setRecordingSource] = useState('');
  const [recordingDirty, setRecordingDirty] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | undefined>();
  const [index, setIndex] = useState<FrameworkIndex | undefined>();
  const [governance, setGovernance] = useState<AnalysisResponse['governance'] | undefined>();
  const [execution, setExecution] = useState<any>();
  const [git, setGit] = useState<any>();
  const [pullRequestReadiness, setPullRequestReadiness] = useState<PullRequestReadiness | undefined>();
  const [pullRequest, setPullRequest] = useState<CreatedPullRequest | undefined>();
  const [closedPullRequest, setClosedPullRequest] = useState<ClosedPullRequest | undefined>();
  const [gitRemote, setGitRemoteUrl] = useState('');
  const [githubLoginPending, setGithubLoginPending] = useState(false);
  const [learning, setLearning] = useState<LearningDashboardResponse | undefined>();
  const [installMissingDependencies, setInstallMissingDependencies] = useState(false);
  const [runAccessibilityWithFunctional, setRunAccessibilityWithFunctional] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice | undefined>({
    tone: 'info',
    title: 'Choose how to create your script',
    message: 'Upload or paste an existing Playwright script, or enter a URL to record one automatically. When the script is ready, click Analyze to generate a reviewed proposal.',
    visibleOn: ['Upload Center']
  });

  useEffect(() => {
    const onHashChange = () => setActive(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    refreshIndex();
    refreshLearning();
    apiGet<AnalysisResponse['governance']>('/api/governance/report').then(setGovernance).catch(() => undefined);
    refreshGit();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!recording || recording.status !== 'running') return;
    const refreshRecording = async () => {
      try {
        const next = await getRecording(recording.id);
        setRecording(next);
        if (!recordingDirty) setRecordingSource(next.editedSource || next.generatedSource);
      } catch (err) {
        setError(String(err));
      }
    };
    const timer = window.setInterval(refreshRecording, 1500);
    return () => window.clearInterval(timer);
  }, [recording?.id, recording?.status, recordingDirty]);

  useEffect(() => {
    if (!notice || notice.tone !== 'success') return;
    const timer = window.setTimeout(() => {
      setNotice((current) => current === notice ? undefined : current);
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!githubLoginPending) return;
    const checkLogin = async () => {
      try {
        const readiness = await getPullRequestReadiness();
        setPullRequestReadiness(readiness);
        if (readiness.remote) setGitRemoteUrl(readiness.remote);
        const stillWaiting = readiness.blockers.some((blocker) =>
          blocker.includes('GitHub CLI is not installed') || blocker.includes('GitHub CLI is not authenticated')
        );
        if (!stillWaiting) {
          setGithubLoginPending(false);
          setNotice({
            tone: 'success',
            title: 'GitHub sign-in complete',
            message: 'GitHub CLI is authenticated. You can now confirm the repository URL and continue with pull-request setup.',
            visibleOn: ['Git & Pull Request']
          });
        }
      } catch {
        // Keep polling while the separate GitHub CLI sign-in window is open.
      }
    };
    void checkLogin();
    const timer = window.setInterval(() => void checkLogin(), 3_000);
    return () => window.clearInterval(timer);
  }, [githubLoginPending]);

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

  async function refreshGit() {
    const [nextGit, readiness] = await Promise.all([
      apiGet('/api/git/status').catch(() => undefined),
      getPullRequestReadiness().catch(() => undefined)
    ]);
    setGit(nextGit);
    setPullRequestReadiness(readiness);
    if (readiness?.remote) setGitRemoteUrl(readiness.remote);
  }

  async function saveGitRemote() {
    setBusy(true);
    setError(undefined);
    try {
      const readiness = await setGitRemote(gitRemote);
      setPullRequestReadiness(readiness);
      setNotice({
        tone: 'success',
        title: 'GitHub repository configured',
        message: 'The repository remote was saved. Complete any remaining GitHub setup steps shown in Git & Pull Request.',
        visibleOn: ['Git & Pull Request']
      });
      await refreshGit();
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Could not save repository URL', message, visibleOn: ['Git & Pull Request'] });
    } finally {
      setBusy(false);
    }
  }

  async function beginGitHubLogin() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await startGitHubLogin();
      setGithubLoginPending(true);
      setNotice({ tone: 'info', title: 'Complete GitHub sign-in', message: result.message, visibleOn: ['Git & Pull Request'] });
    } catch (err) {
      const rawMessage = String(err);
      const message = rawMessage.includes('Cannot POST /api/git/auth/login')
        ? 'Your API server is running an older version. Stop the current dev server, run npm run dev again, then retry GitHub sign-in.'
        : rawMessage;
      setError(message);
      setNotice({ tone: 'error', title: 'GitHub sign-in could not start', message, visibleOn: ['Git & Pull Request'] });
    } finally {
      setBusy(false);
    }
  }

  async function closeDraftPullRequest(deleteRemoteBranch: boolean) {
    const currentPullRequest = pullRequest ?? (pullRequestReadiness?.existingPullRequest
      ? {
          ...pullRequestReadiness.existingPullRequest,
          baseBranch: pullRequestReadiness.baseBranch ?? '',
          commit: '',
          updated: true
        }
      : undefined);
    if (!currentPullRequest) return;
    if (deleteRemoteBranch && !window.confirm('Close this pull request and permanently delete its remote automation branch? Your local branch and files will be kept.')) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const closed = await closeGitHubPullRequest({
        url: currentPullRequest.url,
        branch: currentPullRequest.branch,
        deleteRemoteBranch
      });
      setClosedPullRequest(closed);
      setPullRequest(undefined);
      setNotice({
        tone: 'success',
        title: deleteRemoteBranch ? 'Pull request closed and remote branch deleted' : 'Pull request closed',
        message: deleteRemoteBranch
          ? 'The draft pull request was closed and its remote automation branch was deleted. Your local branch and files were kept.'
          : 'The draft pull request was closed. Its branch and files were kept, so you can reopen or reuse them later.',
        visibleOn: ['Git & Pull Request']
      });
      await refreshGit();
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Could not close pull request', message, visibleOn: ['Git & Pull Request'] });
    } finally {
      setBusy(false);
    }
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

  async function beginRecording() {
    setBusy(true);
    setError(undefined);
    try {
      const session = await startRecording(recordingUrl);
      setRecording(session);
      setRecordingSource(session.editedSource || session.generatedSource);
      setRecordingDirty(false);
      setNotice({
        tone: 'info',
        title: 'Codegen recording started',
        message: 'The Playwright browser and Inspector opened locally. Perform your steps there; generated code will appear below.',
        visibleOn: ['Upload Center']
      });
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Could not start Codegen', message, visibleOn: ['Upload Center'] });
    } finally {
      setBusy(false);
    }
  }

  async function endRecording() {
    if (!recording) return;
    setBusy(true);
    try {
      const session = await stopRecording(recording.id);
      setRecording(session);
      if (!recordingDirty) setRecordingSource(session.editedSource || session.generatedSource);
      setNotice({
        tone: 'success',
        title: 'Recording stopped',
        message: 'Review or edit the captured script, then save and upload it for analysis.',
        visibleOn: ['Upload Center']
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAndUploadRecording() {
    if (!recording) return;
    setBusy(true);
    setError(undefined);
    try {
      const session = await saveRecording(recording.id, recordingSource);
      setRecording(session);
      setSource(recordingSource);
      const result = await uploadScript(recordingSource, 'recorded.spec.ts');
      setAnalysis(result);
      setGovernance(result.governance);
      setNotice({
        tone: 'success',
        title: 'Recording saved and analyzed',
        message: 'Review the generated framework proposal and approve it only when it is correct.',
        visibleOn: ['Confidence Dashboard']
      });
      navigate('Confidence Dashboard');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Save and upload failed', message, visibleOn: ['Upload Center'] });
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
      visibleOn: ['Confidence Dashboard', 'Git & Pull Request']
    });
    let filesApplied = false;
    try {
      const readiness = await getPullRequestReadiness();
      setPullRequestReadiness(readiness);
      if (!readiness.ready) throw new Error(`GitHub pull request cannot be created: ${readiness.blockers.join(' ')}`);
      await apiPost('/api/analysis/apply', { files: analysis.proposedChange.files, approved: true });
      filesApplied = true;
      const workflowName = analysis.parsed.workflows[0]?.name ?? 'generated workflow';
      const createdPullRequest = await createPullRequest({
        files: analysis.proposedChange.files.map((file) => file.path),
        title: `Add ${workflowName} Playwright automation`,
        body: `## Summary\n\n- Adds generated Playwright automation for ${workflowName}.\n- Includes a page object, functional test, and accessibility test.\n\n## Validation\n\n- Reviewed through Enterprise Playwright Platform before approval.`
      });
      setPullRequest(createdPullRequest);
      await refreshIndex();
      await refreshLearning();
      await refreshGit();
      setNotice({
        tone: 'success',
        title: createdPullRequest.updated ? 'Draft pull request updated' : 'Draft pull request created',
        message: createdPullRequest.updated
          ? `The approved files were committed and pushed to the existing draft pull request on ${createdPullRequest.branch}.`
          : `The approved files were committed and a draft GitHub pull request was created on ${createdPullRequest.branch}.`,
        visibleOn: ['Git & Pull Request']
      });
      navigate('Git & Pull Request');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: filesApplied ? 'Files applied, but PR creation failed' : 'Approval could not start',
        message: filesApplied ? `The approved files are in the working tree, but no pull request was created. ${message}` : message,
        visibleOn: ['Confidence Dashboard', 'Git & Pull Request']
      });
      if (filesApplied) {
        await refreshGit();
        navigate('Git & Pull Request');
      }
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
            {active === 'Upload Center' && <button onClick={analyze} disabled={busy}><Upload size={16} />Analyze script</button>}
            {active === 'Execution Center' && (
              <>
                <button onClick={runTests} disabled={busy || !index?.tests.length}><Play size={16} />Run tests</button>
                <label className="run-option">
                  <input
                    type="checkbox"
                    checked={installMissingDependencies}
                    onChange={(event) => setInstallMissingDependencies(event.target.checked)}
                    disabled={busy}
                  />
                  <span>Install missing dependencies if needed</span>
                </label>
                <label className="run-option">
                  <input
                    type="checkbox"
                    checked={runAccessibilityWithFunctional}
                    onChange={(event) => setRunAccessibilityWithFunctional(event.target.checked)}
                    disabled={busy}
                  />
                  <span>Include accessibility tests</span>
                </label>
              </>
            )}
            {active === 'Confidence Dashboard' && <button onClick={applyChange} disabled={busy || !analysis}><CheckCircle2 size={16} />Approve files</button>}
          </div>
        </header>
        {error && <div className="alert">{error}</div>}
        <section className="content">
          {notice && shouldShowNotice(notice, active) && <NoticeBanner notice={notice} />}
          {active === 'Getting Started' && <GettingStarted navigate={navigate} />}
          {active === 'Upload Center' && (
            <UploadCenter
              source={source}
              setSource={setSource}
              recordingUrl={recordingUrl}
              setRecordingUrl={setRecordingUrl}
              recording={recording}
              recordingSource={recordingSource}
              setRecordingSource={(value) => { setRecordingSource(value); setRecordingDirty(true); }}
              startRecording={beginRecording}
              stopRecording={endRecording}
              saveAndUpload={saveAndUploadRecording}
              busy={busy}
            />
          )}
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
          {active === 'Execution Center' && <Execution execution={execution} hasTests={Boolean(index?.tests.length)} />}
          {active === 'Self-Healing Console' && <Healing execution={execution} />}
          {active === 'AI Insights' && <AiInsights analysis={analysis} />}
          {active === 'Learning Dashboard' && <LearningDashboard learning={learning} />}
          {active === 'Token Analytics' && <TokenAnalytics stats={stats} />}
          {active === 'Git & Pull Request' && (
            <GitReview
              git={git}
              readiness={pullRequestReadiness}
              pullRequest={pullRequest ?? (pullRequestReadiness?.existingPullRequest
                ? {
                    ...pullRequestReadiness.existingPullRequest,
                    baseBranch: pullRequestReadiness.baseBranch ?? '',
                    commit: '',
                    updated: true
                  }
                : undefined)}
              closedPullRequest={closedPullRequest}
              remote={gitRemote}
              setRemote={setGitRemoteUrl}
              saveRemote={saveGitRemote}
              startLogin={beginGitHubLogin}
              refresh={refreshGit}
              loginPending={githubLoginPending}
              closePullRequest={closeDraftPullRequest}
              busy={busy}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function GettingStarted({ navigate }: { navigate: (page: string) => void }) {
  return (
    <div className="stack">
      <div className="panel wide getting-started-hero">
        <h2>Start here</h2>
        <p>Create or upload a Playwright script, review the proposed framework files, approve them, then run the tests.</p>
        <div className="next-actions">
          <button className="primary" onClick={() => navigate('Upload Center')}><Upload size={16} />Create a script</button>
          <button onClick={() => navigate('Framework Explorer')}><FileSearch size={16} />View project assets</button>
        </div>
      </div>
      <div className="guide-steps">
        <GuideStep number="1" title="Create a script" text="Upload an existing Playwright script or enter a URL to record one with Playwright Codegen." action="Open Upload Center" onClick={() => navigate('Upload Center')} />
        <GuideStep number="2" title="Analyze the script" text="The platform checks the script, looks for reusable assets, and prepares page object, functional, and accessibility test proposals." action="Review confidence" onClick={() => navigate('Confidence Dashboard')} />
        <GuideStep number="3" title="Review and approve" text="Preview the proposed files and project-rule checks. Approval commits only those files and creates a draft GitHub pull request." action="View project rules" onClick={() => navigate('Governance Dashboard')} />
        <GuideStep number="4" title="Run the tests" text="Run functional tests, optionally include accessibility tests, and use the failure guidance if a test needs attention." action="Open Execution Center" onClick={() => navigate('Execution Center')} />
      </div>
      <div className="panel wide">
        <h2>What each tab is for</h2>
        <Table rows={Object.entries(tabDescriptions).map(([tab, description]) => [tab, description])} />
      </div>
    </div>
  );
}

function GuideStep({ number, title, text, action, onClick }: { number: string; title: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="panel guide-step">
      <span className="guide-number">{number}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button onClick={onClick}>{action}</button>
    </div>
  );
}

function UploadCenter(props: {
  source: string;
  setSource: (value: string) => void;
  recordingUrl: string;
  setRecordingUrl: (value: string) => void;
  recording?: RecordingSession;
  recordingSource: string;
  setRecordingSource: (value: string) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  saveAndUpload: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="stack">
      <p className="intake-intro">Choose one way to create your Playwright script:</p>
      <div className="intake-options">
        <div className="panel wide">
          <h2>1. Upload or paste a script</h2>
          <p className="helper-text">Use this when you already have a Playwright script. Paste it or choose a file, make any edits, then click Analyze.</p>
          <label className="file-picker">
            <span>Choose a .ts or .js script</span>
            <input
              type="file"
              accept=".ts,.tsx,.js,.jsx,text/javascript,text/typescript"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (file) props.setSource(await file.text());
                event.currentTarget.value = '';
              }}
            />
          </label>
          <textarea value={props.source} onChange={(event) => props.setSource(event.target.value)} spellCheck={false} />
        </div>
        <div className="option-divider" aria-hidden="true"><span>OR</span></div>
        <div className="panel">
          <h2>2. Record a new script from a URL</h2>
          <p className="helper-text">Use this when you want Playwright to capture your actions automatically.</p>
          <div className="recording-controls">
            <input
              type="url"
              value={props.recordingUrl}
              onChange={(event) => props.setRecordingUrl(event.target.value)}
              placeholder="https://example.com"
              disabled={props.busy || props.recording?.status === 'running'}
            />
            <button className="primary" onClick={props.startRecording} disabled={props.busy || props.recording?.status === 'running'}>
              <Play size={16} />Start recording
            </button>
            <button onClick={props.stopRecording} disabled={props.busy || props.recording?.status !== 'running'}>Stop recording</button>
          </div>
          <div className="recording-guide">
            <strong>What happens after Start recording</strong>
            <ol>
              <li>A Playwright browser and Inspector window open on this computer.</li>
              <li>Use the browser normally; Playwright records each action.</li>
              <li>Click Stop recording here when you are finished.</li>
              <li>Review and edit the generated script below, then select Save & Upload.</li>
            </ol>
          </div>
          <p className="helper-text">Your script is only analyzed after you choose Save & Upload. It is not added to the framework until you approve the generated proposal.</p>
          {props.recording && <p className="helper-text">Session status: <strong>{props.recording.status}</strong>{props.recording.error ? ` — ${props.recording.error}` : ''}</p>}
        </div>
      </div>
      {props.recording && (
        <div className="panel wide">
          <div className="section-header">
            <div>
              <h2>Editable recorded script</h2>
              <p className="helper-text">Session: {props.recording.status}. Generated code: {props.recordingSource ? `${props.recordingSource.split('\n').length} lines` : 'waiting for recorded actions'}.</p>
            </div>
            <button className="primary" onClick={props.saveAndUpload} disabled={props.busy || !props.recordingSource.trim()}><Upload size={16} />Save & Upload</button>
          </div>
          <textarea value={props.recordingSource} onChange={(event) => props.setRecordingSource(event.target.value)} spellCheck={false} />
        </div>
      )}
    </div>
  );
}

function Explorer({ index }: { index?: FrameworkIndex }) {
  const assetCount = (index?.tests.length ?? 0) + (index?.pageObjects.length ?? 0);
  return (
    <div className="stack">
      <div className="panel wide">
        <h2>Existing automation assets</h2>
        <p className="helper-text">This tab shows the approved tests, page objects, locators, workflows, and accessibility coverage already available in this project. The platform uses these assets to avoid creating duplicates.</p>
      </div>
      {assetCount === 0 ? (
        <div className="empty">This is a fresh project—there are no approved automation assets yet. Start in Upload Center to create or record a script, then analyze and approve the proposed files. They will appear here after approval.</div>
      ) : (
        <>
          <Grid items={[
            ['Approved tests', index?.tests.length ?? 0],
            ['Detected workflows', index?.workflows.length ?? 0],
            ['Page objects', index?.pageObjects.length ?? 0],
            ['Reusable locators', index?.locators.length ?? 0],
            ['Accessibility checks', index?.accessibility.length ?? 0]
          ]} />
          <div className="workspace">
            <AssetList title="Test files" items={index?.tests ?? []} name="name" path="filePath" />
            <AssetList title="Page objects" items={index?.pageObjects ?? []} name="name" path="filePath" />
          </div>
        </>
      )}
    </div>
  );
}

function AssetList({ title, items, name, path }: { title: string; items: unknown[]; name: string; path: string }) {
  const rows = items.slice(0, 8).map((item) => {
    const asset = item as Record<string, unknown>;
    return [String(asset[name] ?? 'Unnamed asset'), String(asset[path] ?? '')];
  });
  return <div className="panel wide"><h2>{title}</h2><Table rows={rows} /></div>;
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
  const learningFactors = analysis.confidence.learningInfluence?.factors ?? [];
  const learningAdjustment = analysis.confidence.learningInfluence?.adjustment ?? 0;
  const workflowSimilarity = analysis.confidence.similarityMetrics.workflowSimilarity ?? 0;
  return (
    <div className="workspace">
      <div className="panel">
        <h2>Recommendation</h2>
        <div className={`score ${analysis.confidence.band}`}>{analysis.confidence.score}%</div>
        <Metric label="What to do" value={confidenceAction(analysis.confidence.band)} />
        <Metric label="Score before project history" value={`${analysis.confidence.learningInfluence?.originalScore ?? analysis.confidence.score}%`} />
        <Metric label="Change from past project results" value={`${learningAdjustment > 0 ? '+' : ''}${learningAdjustment} points`} />
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
        <h2>What we checked</h2>
        <p className="helper-text">These checks help you decide whether the generated files are safe to review and approve.</p>
        <Table rows={[
          [
            'Existing workflow match',
            workflowSimilarity ? `${workflowSimilarity}% similar` : 'No close match found',
            workflowSimilarity
              ? 'The platform found a related workflow already in this project.'
              : 'This looks like a new workflow, so review the generated files carefully.'
          ],
          [
            'Project rules',
            analysis.governance.passed ? 'Passed' : 'Needs attention',
            analysis.governance.passed
              ? 'Naming, folder placement, locator rules, and test structure passed.'
              : 'Open Governance Dashboard to review the issues before approving.'
          ],
          [
            'Past project experience',
            `${learningAdjustment > 0 ? '+' : ''}${learningAdjustment} points`,
            learningAdjustment
              ? 'Past accepted changes and test outcomes adjusted the score. This does not replace your review.'
              : 'No relevant past project results changed this score.'
          ]
        ]} />
        <h2 className="section-title">How past project experience affected the score</h2>
        <p className="helper-text">This is based only on previous team decisions and results saved in this project.</p>
        <Table rows={learningFactors.map((factor) => [friendlyFactorName(factor.name), formatAdjustment(factor.adjustment), factor.evidence])} />
        <details className="technical-details">
          <summary>Show technical details</summary>
          <Table rows={[
            ...Object.entries(analysis.confidence.similarityMetrics).map(([key, value]) => [key, String(value)]),
            ...analysis.confidence.retrievedAssetsUsed.map((asset) => ['Related project asset', asset])
          ]} />
        </details>
      </div>
    </div>
  );
}

function confidenceAction(band: string): string {
  if (band === 'auto') return 'Ready for approval';
  if (band === 'approval') return 'Review, then approve';
  if (band === 'recommendation') return 'Manual review needed';
  return 'Do not approve yet';
}

function friendlyFactorName(name: string): string {
  const labels: Record<string, string> = {
    'Historical Acceptance Rate': 'Similar changes accepted before',
    'Governance Compliance': 'Matches project rules',
    'Previous Success Rate': 'Similar changes worked in test runs',
    'Team Preference Alignment': 'Matches team standards',
    'Execution Success History': 'Result of the latest test run'
  };
  return labels[name] ?? name;
}

function formatAdjustment(value: number): string {
  return value === 0 ? 'No change' : `${value > 0 ? '+' : ''}${value} points`;
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

function Execution({ execution, hasTests }: { execution: any; hasTests: boolean }) {
  const installSummary = execution?.result.installActions?.length
    ? execution.result.installActions.map((action: any) => `${action.command}: ${action.success ? 'installed' : 'failed'}`).join('\n')
    : 'No dependency install attempted.';

  return (
    <div className="panel wide">
      <h2>Run Result</h2>
      {!execution && !hasTests && <div className="empty">No approved tests are available yet. Create a script, analyze it, review the proposal, and approve the generated files before running tests.</div>}
      <Metric label="Command" value="npx playwright test" />
      <Metric label="Status" value={execution ? (execution.result.passed ? 'Passed' : 'Failed') : hasTests ? 'Ready to run' : 'Waiting for approved tests'} />
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

function GitReview({
  git,
  readiness,
  pullRequest,
  closedPullRequest,
  remote,
  setRemote,
  saveRemote,
  startLogin,
  refresh,
  loginPending,
  closePullRequest,
  busy
}: {
  git: any;
  readiness?: PullRequestReadiness;
  pullRequest?: CreatedPullRequest;
  closedPullRequest?: ClosedPullRequest;
  remote: string;
  setRemote: (value: string) => void;
  saveRemote: () => Promise<void>;
  startLogin: () => Promise<void>;
  refresh: () => Promise<void>;
  loginPending: boolean;
  closePullRequest: (deleteRemoteBranch: boolean) => Promise<void>;
  busy: boolean;
}) {
  const setupCommand = 'gh auth login --web';
  const cliMissing = readiness?.blockers.some((blocker) => blocker.includes('GitHub CLI is not installed')) ?? false;
  const authMissing = readiness?.blockers.some((blocker) => blocker.includes('GitHub CLI is not authenticated')) ?? false;
  const canSaveRemote = readiness !== undefined && !cliMissing && !authMissing;
  const signedIn = readiness !== undefined && !cliMissing && !authMissing;
  return (
    <div className="stack">
      <div className="workspace">
        <div className="panel github-login">
          <h2>1. Sign in to GitHub</h2>
          <p className="helper-text">Required once per computer. You do not need to edit or type a key into this app.</p>
          {cliMissing ? (
            <div className="setup-warning">
              <strong>Install GitHub CLI first</strong>
              <span>Install it from <a href="https://cli.github.com/" target="_blank" rel="noreferrer">cli.github.com</a>, then click Check setup again.</span>
            </div>
          ) : signedIn ? (
            <div className="setup-explanation">
              <strong>GitHub sign-in complete</strong>
              <span>GitHub CLI is authenticated on this computer. Continue to confirm the repository URL.</span>
            </div>
          ) : (
            <div className="setup-explanation">
              <strong>What Sign in with GitHub does</strong>
              <span>Opens a visible GitHub CLI sign-in session. Follow its prompts and browser login; the app never stores your GitHub password or token.</span>
            </div>
          )}
          <div className="next-actions">
            <button className="primary" onClick={startLogin} disabled={busy || cliMissing || loginPending || signedIn}>{cliMissing ? 'Install GitHub CLI first' : signedIn ? 'Signed in to GitHub' : loginPending ? 'Waiting for sign-in…' : 'Sign in with GitHub'}</button>
            <button onClick={() => navigator.clipboard.writeText(setupCommand)}>Copy sign-in command</button>
            <button onClick={refresh} disabled={busy}>Check setup again</button>
          </div>
          {loginPending && <p className="helper-text">Checking GitHub CLI automatically every few seconds. This page will update when sign-in is complete.</p>}
          <details className="command-details">
            <summary>Show the technical command</summary>
            <code>{setupCommand}</code>
          </details>
        </div>
        <div className="panel wide repository-setup">
          <h2>2. Confirm the GitHub repository</h2>
          <p className="helper-text">After you sign in, confirm where draft pull requests should be created.</p>
          <div className="recording-controls">
            <input
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
              placeholder="https://github.com/owner/repository.git"
              disabled={busy || !canSaveRemote}
            />
            <button onClick={saveRemote} disabled={busy || !remote.trim() || !canSaveRemote}>Save repository URL</button>
          </div>
          {canSaveRemote ? (
            <div className="setup-explanation">
              <strong>What Save repository URL does</strong>
              <span>It updates this project’s local Git <code>origin</code> remote. It does not upload code, commit files, or create a pull request.</span>
            </div>
          ) : (
            <div className="setup-warning">
              <strong>Sign in first</strong>
              <span>Repository saving is enabled after GitHub CLI is installed and you have signed in, so the platform can verify the destination.</span>
            </div>
          )}
        </div>
      </div>
      <div className="panel wide">
        <h2>GitHub pull request</h2>
        <p className="helper-text">When you approve a proposal, the platform commits only the generated files, pushes a new automation branch, and creates a draft GitHub pull request.</p>
        {pullRequest ? (
          <>
            <div className="pull-request-link">
              <a href={pullRequest.url} target="_blank" rel="noreferrer">Open draft pull request ↗</a>
              <span>Open GitHub to review, mark it ready for review, request reviewers, or merge it.</span>
            </div>
            <Table rows={[
              ['Branch', pullRequest.branch],
              ['Latest commit', pullRequest.commit || 'Existing draft pull request'],
              ['Next approval', 'Adds another commit to this same draft pull request']
            ]} />
            <div className="pull-request-actions">
              <div>
                <strong>Changed your mind?</strong>
                <span>Close PR keeps the branch and files, so it can be reopened or reused later.</span>
              </div>
              <button onClick={() => closePullRequest(false)} disabled={busy}>Close PR</button>
              <button className="danger" onClick={() => closePullRequest(true)} disabled={busy}>Close PR & delete remote branch</button>
            </div>
          </>
        ) : closedPullRequest ? (
          <div className="setup-explanation">
            <strong>Pull request closed</strong>
            <span>{closedPullRequest.remoteBranchDeleted ? 'The remote automation branch was deleted. Your local branch and files were kept.' : 'The branch and files were kept, so they can be reused later.'}</span>
          </div>
        ) : readiness ? (
          <>
            <Metric label="Ready to create PR" value={readiness.ready ? 'Yes' : 'Setup required'} />
            {!readiness.ready && <Table rows={readiness.blockers.map((blocker) => ['Before approval', blocker])} />}
          </>
        ) : <Empty label="Checking GitHub pull request setup…" />}
      </div>
      <div className="workspace">
        <CodePanel title="Working tree status" code={git?.status ?? 'Git repository is not initialized.'} />
        <CodePanel title="Changes not yet committed" code={git?.diff || 'No tracked-file diff is currently available.'} />
      </div>
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
  return pageRoutes.get(key) ?? 'Getting Started';
}

function hashForPage(page: string): string {
  return `#/${slugify(page)}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function pageDescription(active: string, analysis?: AnalysisResponse, execution?: any): string {
  if (active === 'Confidence Dashboard' && !analysis) return 'Analyze a script first, then use this tab to review its proposal before approving it.';
  if (active === 'Execution Center' && execution) return 'Review the latest test run and its logs. If it failed, open Self-Healing Console for guidance.';
  return tabDescriptions[active] ?? 'Choose a tab from the sidebar to continue.';
}

const tabDescriptions: Record<string, string> = {
  'Getting Started': 'A guided overview of the workflow and a plain-language explanation of every tab.',
  'Upload Center': 'Create a script by uploading or pasting one, or record a new script from a URL with Playwright Codegen.',
  'Framework Explorer': 'See what tests, workflows, page objects, locators, and accessibility checks already exist in this project.',
  'Index Dashboard': 'See when the project scan last ran and how much automation code it found.',
  'Governance Dashboard': 'Check whether the project follows naming, folder, locator, and accessibility rules.',
  'Confidence Dashboard': 'Review why a proposed change was suggested, preview its files, and approve it only when it is correct.',
  'Functional Tests': 'Preview the functional test file that would be created after approval.',
  'Accessibility Tests': 'Preview the accessibility test file that would be created after approval.',
  'Execution Center': 'Run the approved tests and choose whether to include accessibility tests.',
  'Self-Healing Console': 'See suggested next steps when the most recent test run fails.',
  'AI Insights': 'See the limited information used for optional AI review; raw repository code is not sent to AI.',
  'Learning Dashboard': 'See aggregate patterns from approved project decisions and successful outcomes.',
  'Token Analytics': 'See how indexing reduces the amount of project information needed for analysis.',
  'Git & Pull Request': 'Check GitHub setup and see the draft pull request created automatically after approval.'
};

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
