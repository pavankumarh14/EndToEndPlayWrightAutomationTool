import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  FileSearch,
  Gauge,
  GitBranch,
  Play,
  ShieldCheck,
  Upload,
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
  uploadScript,
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

type StagedProposal = {
  id: string;
  workflowName: string;
  files: AnalysisResponse['proposedChange']['files'];
  approvalAllowed: boolean;
  approvalReason: string;
};

const batchStorageKey = 'playwright-automation-studio.pr-batch';

const modules = [
  ['Start Here', CircleHelp],
  ['Create Test', Upload],
  ['Review & Approve', Gauge],
  ['Project Library', FileSearch],
  ['Run Tests', Play],
  ['Git & Pull Requests', GitBranch],
] as const;

const pageRoutes = new Map(modules.map(([label]) => [slugify(label), label]));
const legacyPageRoutes: Record<string, string> = {
  'getting-started': 'Start Here',
  'upload-center': 'Create Test',
  'confidence-dashboard': 'Review & Approve',
  'framework-explorer': 'Project Library',
  'execution-center': 'Run Tests',
  'git-pull-request': 'Git & Pull Requests',
  'index-dashboard': 'Index Dashboard',
  'governance-dashboard': 'Governance Dashboard',
  'functional-tests': 'Functional Tests',
  'accessibility-tests': 'Accessibility Tests',
  'self-healing-console': 'Run Tests',
  'ai-insights': 'AI Insights',
  'learning-dashboard': 'Learning Dashboard',
  'token-analytics': 'Token Analytics',
  'proposed-files': 'Proposed Files',
};

function App() {
  const [active, setActive] = useState(() => pageFromHash());
  const [source, setSource] = useState(sample);
  const [workflowName, setWorkflowName] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recording, setRecording] = useState<RecordingSession | undefined>();
  const [recordingSource, setRecordingSource] = useState('');
  const [recordingDirty, setRecordingDirty] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | undefined>();
  const [stagedProposals, setStagedProposals] = useState<StagedProposal[]>(() =>
    readStagedProposals(),
  );
  const [index, setIndex] = useState<FrameworkIndex | undefined>();
  const [governance, setGovernance] = useState<AnalysisResponse['governance'] | undefined>();
  const [execution, setExecution] = useState<any>();
  const [git, setGit] = useState<any>();
  const [pullRequestReadiness, setPullRequestReadiness] = useState<
    PullRequestReadiness | undefined
  >();
  const [pullRequest, setPullRequest] = useState<CreatedPullRequest | undefined>();
  const [closedPullRequest, setClosedPullRequest] = useState<ClosedPullRequest | undefined>();
  const [closeConfirmation, setCloseConfirmation] = useState<boolean | undefined>();
  const [gitRemote, setGitRemoteUrl] = useState('');
  const [githubLoginPending, setGithubLoginPending] = useState(false);
  const [learning, setLearning] = useState<LearningDashboardResponse | undefined>();
  const [installMissingDependencies, setInstallMissingDependencies] = useState(false);
  const [runAccessibilityWithFunctional, setRunAccessibilityWithFunctional] = useState(true);
  const [selectedTestFiles, setSelectedTestFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice | undefined>({
    tone: 'info',
    title: 'Choose how to create your script',
    message:
      'Upload or paste an existing Playwright script, or enter a URL to record one automatically. When the script is ready, click Analyze to generate a reviewed proposal.',
    visibleOn: ['Create Test'],
  });

  useEffect(() => {
    const onHashChange = () => setActive(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    refreshIndex();
    refreshLearning();
    apiGet<AnalysisResponse['governance']>('/api/governance/report')
      .then(setGovernance)
      .catch(() => undefined);
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
      setNotice((current) => (current === notice ? undefined : current));
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    window.localStorage.setItem(batchStorageKey, JSON.stringify(stagedProposals));
  }, [stagedProposals]);

  useEffect(() => {
    if (!githubLoginPending) return;
    const checkLogin = async () => {
      try {
        const readiness = await getPullRequestReadiness();
        setPullRequestReadiness(readiness);
        if (readiness.remote) setGitRemoteUrl(readiness.remote);
        const stillWaiting = readiness.blockers.some(
          (blocker) =>
            blocker.includes('GitHub CLI is not installed') ||
            blocker.includes('GitHub CLI is not authenticated'),
        );
        if (!stillWaiting) {
          setGithubLoginPending(false);
          setNotice({
            tone: 'success',
            title: 'GitHub sign-in complete',
            message:
              'GitHub CLI is authenticated. You can now confirm the repository URL and continue with pull-request setup.',
            visibleOn: ['Git & Pull Requests'],
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

  useEffect(() => {
    const available = new Set((index?.tests ?? []).map((test: any) => test.filePath));
    setSelectedTestFiles((current) => current.filter((file) => available.has(file)));
  }, [index]);

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
      getPullRequestReadiness().catch(() => undefined),
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
        message:
          'The repository remote was saved. Complete any remaining GitHub setup steps shown in Git & Pull Requests.',
        visibleOn: ['Git & Pull Requests'],
      });
      await refreshGit();
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: 'Could not save repository URL',
        message,
        visibleOn: ['Git & Pull Requests'],
      });
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
      setNotice({
        tone: 'info',
        title: 'Complete GitHub sign-in',
        message: result.message,
        visibleOn: ['Git & Pull Requests'],
      });
    } catch (err) {
      const rawMessage = String(err);
      const message = rawMessage.includes('Cannot POST /api/git/auth/login')
        ? 'Your API server is running an older version. Stop the current dev server, run npm run dev again, then retry GitHub sign-in.'
        : rawMessage;
      setError(message);
      setNotice({
        tone: 'error',
        title: 'GitHub sign-in could not start',
        message,
        visibleOn: ['Git & Pull Requests'],
      });
    } finally {
      setBusy(false);
    }
  }

  async function closeDraftPullRequest(deleteRemoteBranch: boolean) {
    const currentPullRequest =
      pullRequest ??
      (pullRequestReadiness?.existingPullRequest
        ? {
            ...pullRequestReadiness.existingPullRequest,
            baseBranch: pullRequestReadiness.baseBranch ?? '',
            commit: '',
            updated: true,
            returnedToDefaultBranch: false,
          }
        : undefined);
    if (!currentPullRequest) return;
    setBusy(true);
    setError(undefined);
    try {
      const closed = await closeGitHubPullRequest({
        url: currentPullRequest.url,
        branch: currentPullRequest.branch,
        deleteRemoteBranch,
      });
      setClosedPullRequest(closed);
      setPullRequest(undefined);
      setNotice({
        tone: 'success',
        title: deleteRemoteBranch
          ? 'Pull request closed and remote branch deleted'
          : 'Pull request closed',
        message: deleteRemoteBranch
          ? 'The draft pull request was closed and its remote automation branch was deleted. Your local branch and files were kept.'
          : 'The draft pull request was closed. Its branch and files were kept, so you can reopen or reuse them later.',
        visibleOn: ['Git & Pull Requests'],
      });
      await refreshGit();
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: 'Could not close pull request',
        message,
        visibleOn: ['Git & Pull Requests'],
      });
    } finally {
      setBusy(false);
    }
  }

  function requestClosePullRequest(deleteRemoteBranch: boolean) {
    setCloseConfirmation(deleteRemoteBranch);
  }

  async function analyze() {
    setBusy(true);
    setError(undefined);
    setNotice({
      tone: 'info',
      title: 'Analyzing upload',
      message:
        'The API is parsing the script, searching the framework index, checking governance, and scoring confidence.',
      visibleOn: ['Create Test', 'Review & Approve'],
    });
    try {
      const result = await uploadScript(
        source,
        'upload.spec.ts',
        stagedProposals.flatMap((proposal) => proposal.files),
        workflowName,
      );
      setAnalysis(result);
      setGovernance(result.governance);
      setNotice({
        tone: 'success',
        title: 'Analysis complete',
        message:
          'Review the confidence evidence, preview generated files, then approve only if the proposal is acceptable.',
        visibleOn: ['Review & Approve', 'Functional Tests', 'Accessibility Tests', 'AI Insights'],
      });
      navigate('Review & Approve');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: 'Analysis failed',
        message,
        visibleOn: ['Create Test', 'Review & Approve'],
      });
    } finally {
      setBusy(false);
    }
  }

  function stageCurrentProposal() {
    if (!analysis) return;
    const workflowName = analysis.parsed.workflows[0]?.name ?? 'Generated workflow';
    const files = analysis.proposedChange.files;
    const stagedPaths = new Set(
      stagedProposals.flatMap((proposal) => proposal.files.map((file) => file.path)),
    );
    const conflicts = files.map((file) => file.path).filter((file) => stagedPaths.has(file));
    if (conflicts.length) {
      setError(
        `This proposal cannot be added to the PR batch because it changes files already staged: ${conflicts.join(', ')}.`,
      );
      return;
    }
    setStagedProposals((current) => [
      ...current,
      {
        id: `${workflowName}-${Date.now()}`,
        workflowName,
        files,
        approvalAllowed: canApproveAnalysis(analysis),
        approvalReason: approvalReason(analysis),
      },
    ]);
    setAnalysis(undefined);
    setSource('');
    setNotice({
      tone: 'success',
      title: 'Test added to PR batch',
      message: `${workflowName} is staged. Create and analyze the next workflow; approve the batch only when all staged tests are ready.`,
      visibleOn: ['Create Test', 'Review & Approve'],
    });
    navigate('Create Test');
  }

  function removeStagedProposal(id: string) {
    setStagedProposals((current) => current.filter((proposal) => proposal.id !== id));
  }

  function clearStagedProposals() {
    setStagedProposals([]);
    setNotice({
      tone: 'info',
      title: 'PR batch cleared',
      message: 'No staged proposals remain. No files were written and no pull request was created.',
      visibleOn: ['Create Test', 'Review & Approve'],
    });
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
        message:
          'The Playwright browser and Inspector opened locally. Perform your steps there; generated code will appear below.',
        visibleOn: ['Create Test'],
      });
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: 'Could not start Codegen',
        message,
        visibleOn: ['Create Test'],
      });
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
        visibleOn: ['Create Test'],
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
      const result = await uploadScript(
        recordingSource,
        'recorded.spec.ts',
        stagedProposals.flatMap((proposal) => proposal.files),
        workflowName,
      );
      setAnalysis(result);
      setGovernance(result.governance);
      setNotice({
        tone: 'success',
        title: 'Recording saved and analyzed',
        message: 'Review the generated framework proposal and approve it only when it is correct.',
        visibleOn: ['Review & Approve'],
      });
      navigate('Review & Approve');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: 'Save and upload failed',
        message,
        visibleOn: ['Create Test'],
      });
    } finally {
      setBusy(false);
    }
  }

  async function applyChange() {
    const currentProposal = analysis
      ? [
          {
            id: 'current',
            workflowName: analysis.parsed.workflows[0]?.name ?? 'Generated workflow',
            files: analysis.proposedChange.files,
            approvalAllowed: canApproveAnalysis(analysis),
            approvalReason: approvalReason(analysis),
          },
        ]
      : [];
    const proposals = [...stagedProposals, ...currentProposal];
    if (!proposals.length) return;
    const blocked = proposals.filter((proposal) => !proposal.approvalAllowed);
    if (blocked.length) {
      setError(
        `Cannot approve this batch yet. Resolve and re-analyze: ${blocked.map((proposal) => proposal.workflowName).join(', ')}. ${blocked[0].approvalReason}`,
      );
      return;
    }
    const files = proposals.flatMap((proposal) => proposal.files);
    const workflowNames = proposals.map((proposal) => proposal.workflowName);
    setBusy(true);
    setNotice({
      tone: 'info',
      title: 'Applying approved proposal',
      message:
        'Generated files are being written to the repository and the framework index is being rebuilt.',
      visibleOn: ['Review & Approve', 'Git & Pull Requests'],
    });
    let filesApplied = false;
    try {
      const readiness = await getPullRequestReadiness();
      setPullRequestReadiness(readiness);
      if (!readiness.ready)
        throw new Error(`GitHub pull request cannot be created: ${readiness.blockers.join(' ')}`);
      await apiPost('/api/analysis/apply', { files, approved: true });
      filesApplied = true;
      const title =
        workflowNames.length === 1
          ? `Add ${workflowNames[0]} Playwright automation`
          : `Add ${workflowNames.length} Playwright automation workflows`;
      const createdPullRequest = await createPullRequest({
        files: files.map((file) => file.path),
        title,
        body: `## Summary\n\n${workflowNames.map((name) => `- Adds generated Playwright automation for ${name}.`).join('\n')}\n\n## Validation\n\n- Reviewed through Playwright Automation Studio before approval.`,
      });
      setPullRequest(createdPullRequest);
      setStagedProposals([]);
      setAnalysis(undefined);
      await refreshIndex();
      await refreshLearning();
      await refreshGit();
      setNotice({
        tone: 'success',
        title: createdPullRequest.updated
          ? 'Draft pull request updated'
          : 'Draft pull request created',
        message: createdPullRequest.updated
          ? `The approved files were committed and pushed to the existing draft pull request on ${createdPullRequest.branch}.${createdPullRequest.returnedToDefaultBranch ? ` This computer is back on ${createdPullRequest.baseBranch}.` : ` The pull request is ready, but Git could not switch this computer back to ${createdPullRequest.baseBranch}; switch branches manually when ready.`}`
          : `The approved files were committed and a draft GitHub pull request was created on ${createdPullRequest.branch}.${createdPullRequest.returnedToDefaultBranch ? ` This computer is back on ${createdPullRequest.baseBranch}.` : ` The pull request is ready, but Git could not switch this computer back to ${createdPullRequest.baseBranch}; switch branches manually when ready.`}`,
        visibleOn: ['Git & Pull Requests'],
      });
      navigate('Git & Pull Requests');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({
        tone: 'error',
        title: filesApplied ? 'Files applied, but PR creation failed' : 'Approval could not start',
        message: filesApplied
          ? `The approved files are in the working tree, but no pull request was created. ${message}`
          : message,
        visibleOn: ['Review & Approve', 'Git & Pull Requests'],
      });
      if (filesApplied) {
        await refreshGit();
        navigate('Git & Pull Requests');
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendFeedback(action: 'accepted' | 'rejected' | 'modified') {
    if (!analysis) return;
    setError(undefined);
    await apiPost('/api/analysis/feedback', {
      source: 'user-suggestion',
      action,
      recommendationType: analysis.proposedChange.kind,
      originalRecommendation: analysis.proposedChange.auditSummary,
      finalOutcome:
        action === 'rejected'
          ? 'User rejected generated recommendation'
          : 'User reviewed recommendation',
      executionResult: 'unknown',
      confidenceScore: analysis.confidence.score,
      patterns: collectPatterns(analysis),
      approved: action !== 'rejected',
    });
    await refreshLearning();
    if (action === 'modified') {
      setNotice({
        tone: 'info',
        title: 'Modify feedback recorded',
        message:
          'You are back in Create Test. Edit the script and click Analyze again to create a new proposal.',
        visibleOn: ['Create Test'],
      });
      navigate('Create Test');
      return;
    }
    if (action === 'rejected') {
      const rejectedFiles = analysis.proposedChange.files.map((file) => file.path);
      const remainingStagedProposals = stagedProposals.filter(
        (proposal) => !sameFilePaths(proposal.files, rejectedFiles),
      );
      setStagedProposals(remainingStagedProposals);
      setAnalysis(undefined);
      setSource('');
      setNotice({
        tone: 'warning',
        title: 'Proposal rejected',
        message: remainingStagedProposals.length
          ? `The rejected proposal was removed. ${workflowCountLabel(remainingStagedProposals.length)} remains in your PR batch; create another script or return to Review & Approve to manage the batch.`
          : 'The rejection was recorded for learning. No files were written; create or analyze another script.',
        visibleOn: ['Create Test', 'Review & Approve'],
      });
      navigate('Create Test');
      return;
    }
    setNotice({
      tone: 'success',
      title: 'Feedback accepted',
      message:
        'The decision was recorded for learning. Use Approve when you are ready to write files to the repository.',
      visibleOn: ['Review & Approve', 'Learning Dashboard'],
    });
  }

  async function runTests() {
    setBusy(true);
    const plannedFiles = selectedTestFiles.length
      ? selectedTestFiles
      : (index?.tests ?? [])
          .map((test: any) => test.filePath)
          .filter(
            (file: string) =>
              runAccessibilityWithFunctional || file.startsWith('tests/functional/'),
          );
    setNotice({
      tone: 'info',
      title: 'Running Playwright',
      message: runAccessibilityWithFunctional
        ? `Running ${plannedFiles.length} approved test file${plannedFiles.length === 1 ? '' : 's'}: ${plannedFiles.join(', ') || 'discovering test files'}.`
        : `Running functional tests only: ${plannedFiles.join(', ') || 'discovering test files'}.`,
      visibleOn: ['Run Tests'],
    });
    try {
      setExecution(
        await apiPost('/api/execution/run', {
          installMissingDependencies,
          runAccessibilityWithFunctional,
          testFiles: selectedTestFiles.length ? selectedTestFiles : undefined,
        }),
      );
      setNotice({
        tone: 'success',
        title: 'Run finished',
        message:
          'Run Tests shows the Playwright result and logs. If it failed, it also shows a suggested next step.',
        visibleOn: ['Run Tests'],
      });
      navigate('Run Tests');
    } catch (err) {
      const message = String(err);
      setError(message);
      setNotice({ tone: 'error', title: 'Run failed to start', message, visibleOn: ['Run Tests'] });
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
          <div className="brand-copy">
            <span>Playwright Automation Studio</span>
            <small>
              AST-first automation: deterministic analysis with Abstract Syntax Trees; optional AI
              for focused review.
            </small>
          </div>
        </div>
        <nav>
          {modules.map(([label, Icon]) => (
            <button
              className={active === label ? 'active' : ''}
              key={label as string}
              onClick={() => navigate(label as string)}
            >
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
            {active === 'Create Test' && (
              <button onClick={analyze} disabled={busy}>
                <Upload size={16} />
                Analyze script
              </button>
            )}
            {active === 'Run Tests' && (
              <>
                <button onClick={runTests} disabled={busy || !index?.tests.length}>
                  <Play size={16} />
                  {selectedTestFiles.length
                    ? `Run selected (${selectedTestFiles.length})`
                    : 'Run tests'}
                </button>
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
                    disabled={busy || selectedTestFiles.length > 0}
                  />
                  <span>
                    {selectedTestFiles.length
                      ? 'Test selection controls scope'
                      : 'Include accessibility tests'}
                  </span>
                </label>
              </>
            )}
            {active === 'Review & Approve' && (
              <button
                onClick={applyChange}
                disabled={
                  busy ||
                  (!analysis && !stagedProposals.length) ||
                  !batchCanBeApproved(stagedProposals, analysis)
                }
              >
                <CheckCircle2 size={16} />
                Approve{' '}
                {stagedProposals.length
                  ? workflowCountLabel(stagedProposals.length + (analysis ? 1 : 0))
                  : 'files'}
              </button>
            )}
          </div>
        </header>
        {error && <div className="alert">{error}</div>}
        <section className="content">
          {notice && shouldShowNotice(notice, active) && <NoticeBanner notice={notice} />}
          {active === 'Start Here' && <GettingStarted navigate={navigate} />}
          {active === 'Create Test' && (
            <UploadCenter
              source={source}
              setSource={setSource}
              workflowName={workflowName}
              setWorkflowName={setWorkflowName}
              recordingUrl={recordingUrl}
              setRecordingUrl={setRecordingUrl}
              recording={recording}
              recordingSource={recordingSource}
              setRecordingSource={(value) => {
                setRecordingSource(value);
                setRecordingDirty(true);
              }}
              startRecording={beginRecording}
              stopRecording={endRecording}
              saveAndUpload={saveAndUploadRecording}
              busy={busy}
            />
          )}
          {active === 'Project Library' && <Explorer index={index} />}
          {active === 'Index Dashboard' && <IndexDashboard index={index} />}
          {active === 'Governance Dashboard' && <Governance report={governance} />}
          {active === 'Review & Approve' && (
            <Confidence
              analysis={analysis}
              sendFeedback={sendFeedback}
              setActive={navigate}
              approve={applyChange}
              stageCurrentProposal={stageCurrentProposal}
              stagedProposals={stagedProposals}
              removeStagedProposal={removeStagedProposal}
              clearStagedProposals={clearStagedProposals}
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
          {active === 'Proposed Files' && (
            <ProposedFiles analysis={analysis} setActive={navigate} />
          )}
          {active === 'Run Tests' && (
            <Execution
              execution={execution}
              availableTests={
                (index?.tests ?? []) as Array<{
                  name: string;
                  filePath: string;
                  hasAccessibilityCoverage: boolean;
                }>
              }
              selectedTestFiles={selectedTestFiles}
              setSelectedTestFiles={setSelectedTestFiles}
            />
          )}
          {active === 'AI Insights' && <AiInsights analysis={analysis} />}
          {active === 'Learning Dashboard' && <LearningDashboard learning={learning} />}
          {active === 'Token Analytics' && <TokenAnalytics stats={stats} />}
          {active === 'Git & Pull Requests' && (
            <GitReview
              git={git}
              readiness={pullRequestReadiness}
              pullRequest={
                pullRequest ??
                (pullRequestReadiness?.existingPullRequest
                  ? {
                      ...pullRequestReadiness.existingPullRequest,
                      baseBranch: pullRequestReadiness.baseBranch ?? '',
                      commit: '',
                      updated: true,
                      returnedToDefaultBranch: false,
                    }
                  : undefined)
              }
              closedPullRequest={closedPullRequest}
              remote={gitRemote}
              setRemote={setGitRemoteUrl}
              saveRemote={saveGitRemote}
              startLogin={beginGitHubLogin}
              refresh={refreshGit}
              loginPending={githubLoginPending}
              closePullRequest={requestClosePullRequest}
              busy={busy}
            />
          )}
        </section>
      </main>
      {closeConfirmation !== undefined && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-pr-title"
            aria-describedby="close-pr-description"
          >
            <h2 id="close-pr-title">
              {closeConfirmation
                ? 'Close PR and delete remote branch?'
                : 'Close this pull request?'}
            </h2>
            <p id="close-pr-description">
              {closeConfirmation
                ? 'This closes the draft pull request and permanently deletes its remote automation branch from GitHub. Your local branch and files will be kept.'
                : 'This closes the draft pull request on GitHub. Its remote branch and your local files will be kept, so it can be reopened or reused later.'}
            </p>
            <div className="modal-actions">
              <button onClick={() => setCloseConfirmation(undefined)} disabled={busy}>
                Cancel
              </button>
              <button
                className={closeConfirmation ? 'danger' : ''}
                onClick={() => {
                  const deleteRemoteBranch = closeConfirmation;
                  setCloseConfirmation(undefined);
                  void closeDraftPullRequest(deleteRemoteBranch);
                }}
                disabled={busy}
              >
                {closeConfirmation ? 'Close PR & delete branch' : 'Close PR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GettingStarted({ navigate }: { navigate: (page: string) => void }) {
  return (
    <div className="stack">
      <div className="panel wide getting-started-hero">
        <h2>Create your first test</h2>
        <p>
          Start with a Playwright script or a recorded browser workflow. The studio then prepares a
          reviewable proposal before anything is written to your project.
        </p>
        <div className="next-actions">
          <button className="primary" onClick={() => navigate('Create Test')}>
            <Upload size={16} />
            Create a script
          </button>
          <button onClick={() => navigate('Project Library')}>
            <FileSearch size={16} />
            View project assets
          </button>
        </div>
      </div>
      <div className="guide-steps">
        <GuideStep
          number="1"
          title="Create a script"
          text="Upload an existing Playwright script or enter a URL to record one with Playwright Codegen."
          action="Create test"
          onClick={() => navigate('Create Test')}
        />
        <GuideStep
          number="2"
          title="Review the proposal"
          text="The platform checks the script, looks for reusable assets, and prepares page object, functional, and accessibility test proposals."
          action="Review proposal"
          onClick={() => navigate('Review & Approve')}
        />
        <GuideStep
          number="3"
          title="Approve and open a draft PR"
          text="Preview the proposed files, project-rule checks, and impact before approval. Approval creates a draft GitHub pull request."
          action="Git & pull requests"
          onClick={() => navigate('Git & Pull Requests')}
        />
        <GuideStep
          number="4"
          title="Run the tests"
          text="Run functional tests, optionally include accessibility tests, and review any failure guidance."
          action="Run tests"
          onClick={() => navigate('Run Tests')}
        />
      </div>
      <p className="helper-text getting-started-note">
        Generated functional and accessibility files are previewed from Review & Approve. If a test
        fails, suggested next steps appear directly below the result in Run Tests.
      </p>
    </div>
  );
}

function GuideStep({
  number,
  title,
  text,
  action,
  onClick,
}: {
  number: string;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
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
  workflowName: string;
  setWorkflowName: (value: string) => void;
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
      <div className="test-name-field">
        <label htmlFor="workflow-name">
          Test name <span>(optional)</span>
        </label>
        <input
          id="workflow-name"
          value={props.workflowName}
          onChange={(event) => props.setWorkflowName(event.target.value)}
          placeholder="For example: account settings update"
          maxLength={80}
        />
        <p>
          Used for generated file names and test titles. Leave blank to use the name detected from
          your script.
        </p>
      </div>
      <div className="intake-options">
        <div className="panel wide">
          <h2>1. Upload or paste a script</h2>
          <p className="helper-text">
            Use this when you already have a Playwright script. Paste it or choose a file, make any
            edits, then click Analyze.
          </p>
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
          <textarea
            value={props.source}
            onChange={(event) => props.setSource(event.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="option-divider" aria-hidden="true">
          <span>OR</span>
        </div>
        <div className="panel">
          <h2>2. Record a new script from a URL</h2>
          <p className="helper-text">
            Use this when you want Playwright to capture your actions automatically.
          </p>
          <div className="recording-controls">
            <input
              type="url"
              value={props.recordingUrl}
              onChange={(event) => props.setRecordingUrl(event.target.value)}
              placeholder="https://example.com"
              disabled={props.busy || props.recording?.status === 'running'}
            />
            <button
              className="primary"
              onClick={props.startRecording}
              disabled={props.busy || props.recording?.status === 'running'}
            >
              <Play size={16} />
              Start recording
            </button>
            <button
              onClick={props.stopRecording}
              disabled={props.busy || props.recording?.status !== 'running'}
            >
              Stop recording
            </button>
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
          <p className="helper-text">
            Your script is only analyzed after you choose Save & Upload. It is not added to the
            framework until you approve the generated proposal.
          </p>
          {props.recording && (
            <p className="helper-text">
              Session status: <strong>{props.recording.status}</strong>
              {props.recording.error ? ` — ${props.recording.error}` : ''}
            </p>
          )}
        </div>
      </div>
      {props.recording && (
        <div className="panel wide">
          <div className="section-header">
            <div>
              <h2>Editable recorded script</h2>
              <p className="helper-text">
                Session: {props.recording.status}. Generated code:{' '}
                {props.recordingSource
                  ? `${props.recordingSource.split('\n').length} lines`
                  : 'waiting for recorded actions'}
                .
              </p>
            </div>
            <button
              className="primary"
              onClick={props.saveAndUpload}
              disabled={props.busy || !props.recordingSource.trim()}
            >
              <Upload size={16} />
              Save & Upload
            </button>
          </div>
          <textarea
            value={props.recordingSource}
            onChange={(event) => props.setRecordingSource(event.target.value)}
            spellCheck={false}
          />
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
        <p className="helper-text">
          This tab shows the approved tests, page objects, locators, workflows, and accessibility
          coverage already available in this project. The platform uses these assets to avoid
          creating duplicates.
        </p>
      </div>
      {assetCount === 0 ? (
        <div className="empty">
          This is a fresh project—there are no approved automation assets yet. Start in Create Test
          to create or record a script, then analyze and approve the proposed files. They will
          appear here after approval.
        </div>
      ) : (
        <>
          <Grid
            items={[
              ['Approved tests', index?.tests.length ?? 0],
              ['Detected workflows', index?.workflows.length ?? 0],
              ['Page objects', index?.pageObjects.length ?? 0],
              ['Reusable locators', index?.locators.length ?? 0],
              ['Accessibility checks', index?.accessibility.length ?? 0],
            ]}
          />
          <div className="workspace">
            <AssetList title="Test files" items={index?.tests ?? []} name="name" path="filePath" />
            <AssetList
              title="Page objects"
              items={index?.pageObjects ?? []}
              name="name"
              path="filePath"
            />
          </div>
        </>
      )}
    </div>
  );
}

function AssetList({
  title,
  items,
  name,
  path,
}: {
  title: string;
  items: unknown[];
  name: string;
  path: string;
}) {
  const rows = items.slice(0, 8).map((item) => {
    const asset = item as Record<string, unknown>;
    return [String(asset[name] ?? 'Unnamed asset'), String(asset[path] ?? '')];
  });
  return (
    <div className="panel wide">
      <h2>{title}</h2>
      <Table rows={rows} />
    </div>
  );
}

function IndexDashboard({ index }: { index?: FrameworkIndex }) {
  return (
    <div className="workspace">
      <div className="panel">
        <h2>Repository Index</h2>
        <Metric
          label="Generated"
          value={index?.generatedAt ? new Date(index.generatedAt).toLocaleString() : 'Pending'}
        />
        <Metric label="Indexed files" value={String(index?.tokenStats.indexedFiles ?? 0)} />
        <Metric label="Processing time" value={`${index?.tokenStats.processingTimeMs ?? 0} ms`} />
      </div>
      <div className="panel wide">
        <h2>Indexes</h2>
        <Grid
          items={[
            ['Test Index', index?.tests.length ?? 0],
            ['Workflow Index', index?.workflows.length ?? 0],
            ['Page Object Index', index?.pageObjects.length ?? 0],
            ['Locator Index', index?.locators.length ?? 0],
            ['Accessibility Index', index?.accessibility.length ?? 0],
          ]}
        />
      </div>
    </div>
  );
}

function Governance({ report }: { report?: AnalysisResponse['governance'] }) {
  return (
    <div className="panel wide">
      <h2>{report?.passed ? 'Governance Passed' : 'Governance Findings'}</h2>
      <Table
        rows={(report?.violations ?? []).map((v) => [
          v.severity,
          v.rule,
          v.message,
          v.filePath ?? '',
        ])}
      />
    </div>
  );
}

function Confidence({
  analysis,
  sendFeedback,
  setActive,
  approve,
  stageCurrentProposal,
  stagedProposals,
  removeStagedProposal,
  clearStagedProposals,
  busy,
}: {
  analysis?: AnalysisResponse;
  sendFeedback: (action: 'accepted' | 'rejected' | 'modified') => Promise<void>;
  setActive: (value: string) => void;
  approve: () => Promise<void>;
  stageCurrentProposal: () => void;
  stagedProposals: StagedProposal[];
  removeStagedProposal: (id: string) => void;
  clearStagedProposals: () => void;
  busy: boolean;
}) {
  if (!analysis && !stagedProposals.length)
    return (
      <Empty label="Analyze a script to review it, or stage several reviewed scripts here as one pull-request batch." />
    );
  if (!analysis) {
    return (
      <div className="stack">
        <BatchPanel
          proposals={stagedProposals}
          remove={removeStagedProposal}
          clear={clearStagedProposals}
          approve={approve}
          busy={busy}
          showApprove
        />
        <div className="panel">
          <h2>Ready for the next workflow</h2>
          <p className="helper-text">
            Your staged tests are not written yet. Create and analyze another script, or approve
            this batch to write all staged files and create one draft pull request.
          </p>
          <button className="primary" onClick={() => setActive('Create Test')}>
            Create another test
          </button>
        </div>
      </div>
    );
  }
  const learningFactors = analysis.confidence.learningInfluence?.factors ?? [];
  const learningAdjustment = analysis.confidence.learningInfluence?.adjustment ?? 0;
  const hasPastExperience = learningFactors.length > 0;
  const workflowSimilarity = analysis.confidence.similarityMetrics.workflowSimilarity ?? 0;
  const approvalAllowed = canApproveAnalysis(analysis);
  return (
    <div className="workspace">
      <div className="panel">
        <h2>Recommendation</h2>
        <div className={`score ${analysis.confidence.band}`}>{analysis.confidence.score}%</div>
        <Metric label="What to do" value={confidenceAction(analysis.confidence.band)} />
        {hasPastExperience && (
          <Metric
            label="Change from matching past project results"
            value={`${learningAdjustment > 0 ? '+' : ''}${learningAdjustment} points`}
          />
        )}
        <p>{analysis.confidence.reasoningSummary}</p>
        <div className="next-actions">
          <button onClick={() => setActive('Create Test')}>
            <ArrowLeft size={16} />
            Edit Upload
          </button>
          <button onClick={() => setActive('Functional Tests')}>Preview Functional</button>
          <button onClick={() => setActive('Accessibility Tests')}>Preview A11y</button>
          <button onClick={() => setActive('Proposed Files')}>Preview all files</button>
          <button onClick={stageCurrentProposal} disabled={busy}>
            Add to PR batch
          </button>
          <button
            className="primary"
            onClick={approve}
            disabled={busy || !batchCanBeApproved(stagedProposals, analysis)}
          >
            <CheckCircle2 size={16} />
            Approve {stagedProposals.length ? `${stagedProposals.length + 1} workflows` : 'files'}
          </button>
        </div>
        <p className="helper-text">
          Add to PR batch lets you create and review another workflow before writing anything.
          Approve writes the current proposal and every staged proposal to one draft pull request.
        </p>
        {!approvalAllowed && (
          <p className="approval-blocked">
            Approval is unavailable: {approvalReason(analysis)} Edit the script or analyze a safer
            proposal before approving.
          </p>
        )}
        <div className="feedback-actions">
          <button onClick={() => sendFeedback('accepted')}>Accept</button>
          <button onClick={() => sendFeedback('modified')}>Modify</button>
          <button onClick={() => sendFeedback('rejected')}>Reject</button>
        </div>
      </div>
      <div className="stack">
        {stagedProposals.length > 0 && (
          <BatchPanel
            proposals={stagedProposals}
            remove={removeStagedProposal}
            clear={clearStagedProposals}
            approve={approve}
            busy={busy}
            showApprove={false}
          />
        )}
        <div className="panel wide">
          <h2>What we checked</h2>
          <p className="helper-text">
            These checks help you decide whether the generated files are safe to review and approve.
          </p>
          {analysis.semanticReview?.status === 'fallback' && (
            <div className="setup-warning">
              <strong>AI review unavailable — safe fallback used</strong>
              <span>{analysis.semanticReview.message}</span>
            </div>
          )}
          <Table
            rows={[
              [
                'Existing workflow match',
                workflowSimilarity ? `${workflowSimilarity}% similar` : 'No close match found',
                workflowSimilarity
                  ? 'The platform found a related workflow already in this project.'
                  : 'This looks like a new workflow, so review the generated files carefully.',
              ],
              [
                'Project rules',
                analysis.governance.passed ? 'Passed' : 'Needs attention',
                analysis.governance.passed
                  ? 'Naming, folder placement, locator rules, and test structure passed.'
                  : 'Expand rule details below and resolve blockers before approving.',
              ],
              ...(hasPastExperience
                ? [
                    [
                      'Past project experience',
                      `${learningAdjustment > 0 ? '+' : ''}${learningAdjustment} points`,
                      'Matching past reviews and test outcomes adjusted the score. This does not replace your review.',
                    ],
                  ]
                : []),
            ]}
          />
          <details className="technical-details">
            <summary>View project-rule details</summary>
            {analysis.governance.violations.length ? (
              <Table
                rows={analysis.governance.violations.map((violation) => [
                  violation.severity,
                  violation.rule,
                  violation.message,
                  violation.filePath ?? '',
                ])}
              />
            ) : (
              <p className="helper-text">All project rules passed for this proposal.</p>
            )}
          </details>
          {hasPastExperience && (
            <>
              <h2 className="section-title">
                How matching past project experience affected the score
              </h2>
              <p className="helper-text">
                This is based only on previous decisions and test results for matching patterns in
                this project.
              </p>
              <Table
                rows={learningFactors.map((factor) => [
                  friendlyFactorName(factor.name),
                  formatAdjustment(factor.adjustment),
                  factor.evidence,
                ])}
              />
            </>
          )}
          <h2 className="section-title">Change scope</h2>
          <p className="helper-text">
            This shows exactly what the proposal will create, update, or reuse before any file is
            written.
          </p>
          <Table
            rows={[
              [
                'Risk',
                analysis.impact.risk === 'low'
                  ? 'Low'
                  : analysis.impact.risk === 'medium'
                    ? 'Medium'
                    : 'High',
                analysis.impact.summary,
              ],
              [
                'Files to create',
                analysis.impact.createdFiles.length
                  ? analysis.impact.createdFiles.join(', ')
                  : 'None',
                'These files will be created after approval.',
              ],
              [
                'Existing files to update',
                analysis.impact.updatedFiles.length
                  ? analysis.impact.updatedFiles.join(', ')
                  : 'None',
                'Existing files are changed only after approval.',
              ],
              [
                'Related existing tests',
                analysis.impact.affectedTests.length
                  ? analysis.impact.affectedTests.join(', ')
                  : 'None found',
                'Tests directly linked to an existing file that this proposal changes.',
              ],
              [
                'Existing assets to reuse',
                analysis.impact.reusedAssets.length
                  ? analysis.impact.reusedAssets.join(', ')
                  : 'None',
                'Existing page objects or components called by the proposed test.',
              ],
            ]}
          />
          <p className="helper-text">{analysis.impact.limitation}</p>
          <h2 className="section-title">Analysis details</h2>
          <Table
            rows={[
              [
                'Workflow similarity',
                `${workflowSimilarity}%`,
                workflowSimilarity
                  ? 'A related workflow was found in this project.'
                  : 'No related workflow was found.',
              ],
              [
                'Related project assets',
                analysis.confidence.retrievedAssetsUsed.length
                  ? analysis.confidence.retrievedAssetsUsed.join(', ')
                  : 'None',
                'Assets considered during the review.',
              ],
            ]}
          />
          <h2 className="section-title">AI and context usage</h2>
          <Table
            rows={[
              [
                'Optional AI review',
                analysis.semanticReview?.status === 'fallback'
                  ? 'Unavailable — deterministic fallback used'
                  : analysis.semanticReview?.provider === 'gemini'
                    ? 'Google Gemini'
                    : analysis.semanticReview?.provider === 'ollama'
                      ? 'Ollama (local)'
                      : 'Not enabled',
              ],
              ['Model', analysis.semanticReview?.model ?? 'Not applicable'],
              [
                'Retrieved context',
                `${analysis.retrieval.tokenEstimate} estimated tokens`,
                'Only relevant framework metadata is considered for semantic review.',
              ],
              [
                'Raw repository source',
                'Not sent to AI',
                'Deterministic AST analysis and governance run locally.',
              ],
              ...(analysis.semanticReview?.message
                ? [
                    [
                      'Fallback message',
                      analysis.semanticReview.message,
                      'The analysis still completed using safe local rules.',
                    ],
                  ]
                : []),
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function BatchPanel({
  proposals,
  remove,
  clear,
  approve,
  busy,
  showApprove,
}: {
  proposals: StagedProposal[];
  remove: (id: string) => void;
  clear: () => void;
  approve: () => Promise<void>;
  busy: boolean;
  showApprove: boolean;
}) {
  const fileCount = proposals.reduce((total, proposal) => total + proposal.files.length, 0);
  const blocked = proposals.filter((proposal) => !proposal.approvalAllowed);
  return (
    <div className="panel pr-batch">
      <div className="section-header">
        <h2>Staged for batch — {workflowCountLabel(proposals.length)}</h2>
        <button className="danger" onClick={clear} disabled={busy}>
          Clear batch
        </button>
      </div>
      <p className="helper-text">
        These reviewed proposals will be written together and included in one draft pull request.
        They are not in the repository yet.
      </p>
      <div className="batch-items">
        {proposals.map((proposal) => (
          <div key={proposal.id} className="batch-item">
            <span>
              <strong>{proposal.workflowName}</strong>
              <small>{proposal.files.map((file) => file.path).join(', ')}</small>
              {!proposal.approvalAllowed && (
                <small className="approval-blocked">
                  Needs attention: {proposal.approvalReason}
                </small>
              )}
            </span>
            <button onClick={() => remove(proposal.id)} disabled={busy}>
              Remove
            </button>
          </div>
        ))}
      </div>
      {showApprove && (
        <div className="next-actions">
          <button className="primary" onClick={approve} disabled={busy || blocked.length > 0}>
            <CheckCircle2 size={16} />
            Approve {proposals.length} workflows ({fileCount} files)
          </button>
        </div>
      )}
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
    'Execution Success History': 'Result of the latest test run',
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
  emptyLabel,
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
            <p className="helper-text">
              These files have not been written yet. Use Approve from Review & Approve to apply
              them.
            </p>
          </div>
          <button onClick={() => setActive('Review & Approve')}>
            <ArrowLeft size={16} />
            Back to Review
          </button>
        </div>
      </div>
      {files.length ? (
        files.map((file) => <CodePanel key={file.path} title={file.path} code={file.content} />)
      ) : (
        <Empty label={emptyLabel} />
      )}
    </div>
  );
}

function ProposedFiles({
  analysis,
  setActive,
}: {
  analysis?: AnalysisResponse;
  setActive: (value: string) => void;
}) {
  if (!analysis) return <Empty label="Analyze a script first to preview every proposed file." />;
  const groups = new Map<string, AnalysisResponse['proposedChange']['files']>();
  for (const file of analysis.proposedChange.files) {
    const folder = file.path.split('/').slice(0, -1).join('/') || 'Project root';
    groups.set(folder, [...(groups.get(folder) ?? []), file]);
  }
  return (
    <div className="stack">
      <div className="panel wide">
        <div className="section-header">
          <div>
            <h2>All proposed files</h2>
            <p className="helper-text">
              Review every file that will be created or updated after approval. Files are grouped by
              their destination folder.
            </p>
          </div>
          <button onClick={() => setActive('Review & Approve')}>
            <ArrowLeft size={16} />
            Back to Review
          </button>
        </div>
        <Table
          rows={analysis.proposedChange.files.map((file) => [
            file.action === 'update' ? 'Update existing file' : 'Create new file',
            file.path,
            `Folder: ${file.path.split('/').slice(0, -1).join('/') || 'project root'}`,
          ])}
        />
      </div>
      {[...groups.entries()].map(([folder, files]) => (
        <div key={folder} className="stack">
          <h2 className="folder-heading">{folder}</h2>
          {files.map((file) => (
            <CodePanel
              key={file.path}
              title={`${file.action === 'update' ? 'Update' : 'Create'} · ${file.path}`}
              code={file.content}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Execution({
  execution,
  availableTests,
  selectedTestFiles,
  setSelectedTestFiles,
}: {
  execution: any;
  availableTests: Array<{ name: string; filePath: string; hasAccessibilityCoverage: boolean }>;
  selectedTestFiles: string[];
  setSelectedTestFiles: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const hasTests = availableTests.length > 0;
  const installSummary = execution?.result.installActions?.length
    ? execution.result.installActions
        .map((action: any) => `${action.command}: ${action.success ? 'installed' : 'failed'}`)
        .join('\n')
    : 'No dependency install attempted.';

  return (
    <div className="stack">
      <div className="panel wide">
        <div className="section-header">
          <div>
            <h2>Choose tests to run</h2>
            <p className="helper-text">
              These test files are from the currently checked-out branch. Select one or more files
              to run only those tests, or leave the list empty to use the functional/accessibility
              option above.
            </p>
          </div>
          <button onClick={() => setSelectedTestFiles([])} disabled={!selectedTestFiles.length}>
            Clear selection
          </button>
        </div>
        {availableTests.length ? (
          <div className="test-selection-list">
            {availableTests.map((test) => {
              const selected = selectedTestFiles.includes(test.filePath);
              return (
                <label key={test.filePath} className="test-selection-item">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() =>
                      setSelectedTestFiles((current) =>
                        selected
                          ? current.filter((file) => file !== test.filePath)
                          : [...current, test.filePath],
                      )
                    }
                  />
                  <span>
                    <strong>{test.name}</strong>
                    <small>
                      {test.filePath}
                      {test.hasAccessibilityCoverage ? ' · accessibility' : ' · functional'}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="empty">No approved test files are available on this branch yet.</div>
        )}
      </div>
      <div className="panel wide">
        <h2>Run Result</h2>
        {!execution && !hasTests && (
          <div className="empty">
            No approved tests are available yet. Create a script, analyze it, review the proposal,
            and approve the generated files before running tests.
          </div>
        )}
        <Metric label="Command" value={execution?.result.command ?? 'npx playwright test'} />
        <Metric
          label="Status"
          value={
            execution
              ? execution.result.passed
                ? 'Passed'
                : 'Failed'
              : hasTests
                ? 'Ready to run'
                : 'Waiting for approved tests'
          }
        />
        <Metric
          label="Functional a11y"
          value={execution?.result.accessibilityWithFunctional ? 'Enabled' : 'Disabled'}
        />
        <Metric label="Dependency retry" value={execution?.result.retried ? 'Yes' : 'No'} />
        {execution?.result.testFiles?.length ? (
          <>
            <h2 className="section-title">Test files run</h2>
            <p className="helper-text">
              These are the approved Playwright files included in this run.
            </p>
            <Table rows={execution.result.testFiles.map((file: string) => ['Run', file])} />
          </>
        ) : !execution && hasTests ? (
          <p className="helper-text">
            Click Run tests to show the exact files selected for this run.
          </p>
        ) : null}
        {execution && !execution.result.passed && <Healing execution={execution} />}
        <pre>{installSummary}</pre>
        <pre>
          {execution?.result.logs ??
            'Run tests to collect logs, screenshots, videos, traces, and root cause analysis.'}
        </pre>
      </div>
    </div>
  );
}

function Healing({ execution }: { execution: any }) {
  return (
    <div className="failure-guidance">
      <h2>Self-healing analysis</h2>
      {execution?.healing ? (
        <>
          <Metric label="Confidence" value={`${execution.healing.confidence.score}%`} />
          <Metric
            label="Analysis"
            value={
              execution.healing.analysisSource === 'ai-assisted'
                ? 'AI-assisted after local checks'
                : execution.healing.analysisSource === 'ai-fallback'
                  ? 'Local checks (AI unavailable)'
                  : 'Local deterministic checks'
            }
          />
          <p className="helper-text">
            This is guidance only. The platform does not edit files or rerun tests automatically.
          </p>
          <p>{execution.healing.rootCause}</p>
          <pre>{execution.healing.proposedFix}</pre>
          <p className="helper-text">
            <strong>Next action:</strong> {execution.healing.nextAction}
          </p>
          {execution.healing.aiMessage && (
            <p className="helper-text">{execution.healing.aiMessage}</p>
          )}
        </>
      ) : (
        <Empty label="No automatic suggestion is available for this failure. Review the run logs and Playwright artifacts." />
      )}
    </div>
  );
}

function AiInsights({ analysis }: { analysis?: AnalysisResponse }) {
  const semanticReview = analysis?.semanticReview;
  return (
    <div className="panel wide">
      <h2>AI review</h2>
      <Table
        rows={[
          [
            'Provider',
            semanticReview?.provider === 'gemini'
              ? 'Google Gemini'
              : semanticReview?.provider === 'ollama'
                ? 'Ollama (local)'
                : 'Not enabled',
          ],
          ['Model', semanticReview?.model ?? 'Not applicable'],
          [
            'Context sent',
            analysis ? 'Workflow summary, retrieved assets, similarity metrics' : 'None',
          ],
          ['Raw repository', 'Blocked'],
          ['Raw code embeddings', 'Blocked'],
          ['Retrieved token estimate', String(analysis?.retrieval.tokenEstimate ?? 0)],
        ]}
      />
    </div>
  );
}

function LearningDashboard({ learning }: { learning?: LearningDashboardResponse }) {
  if (!learning) return <Empty label="Learning profile has not been generated yet." />;
  const outcomes = learning.profile.historicalOutcomes;
  const decisionCount = outcomes.accepted + outcomes.rejected + outcomes.modified;
  if (decisionCount === 0) {
    return (
      <div className="stack">
        <div className="panel wide">
          <h2>Learning history</h2>
          <p className="helper-text">
            Nothing has been learned from this project yet. This page fills in only after real
            proposal reviews and test outcomes.
          </p>
          <div className="setup-explanation">
            <strong>What will appear here</strong>
            <span>
              Approved, modified, and rejected proposals; patterns that worked in test runs; and
              project-specific preferences. The safe Playwright defaults used to generate a proposal
              are not treated as learned team preferences.
            </span>
          </div>
        </div>
        <div className="grid">
          <Metric label="Reviewed proposals" value="0" />
          <Metric label="Successful test runs" value="0" />
          <Metric label="Project preferences" value="Not learned yet" />
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="grid">
        <Metric label="Preferred locator" value={learning.profile.preferredLocatorStrategy} />
        <Metric label="Preferred assertion" value={learning.profile.preferredAssertionStyle} />
        <Metric label="Page object pattern" value={learning.profile.preferredPageObjectPattern} />
        <Metric label="Accessibility rules" value={learning.profile.preferredAccessibilityRules} />
        <Metric label="Self-healing success" value={`${learning.selfHealingSuccessRate}%`} />
        <Metric label="Accepted decisions" value={String(outcomes.accepted)} />
      </div>
      <div className="workspace">
        <div className="panel wide">
          <h2>Most Accepted Recommendations</h2>
          <Table
            rows={learning.mostAcceptedRecommendations.map((item) => [
              item.pattern,
              String(item.count),
              `${item.acceptanceRate}%`,
            ])}
          />
        </div>
        <div className="panel wide">
          <h2>Most Rejected Recommendations</h2>
          <Table
            rows={learning.mostRejectedRecommendations.map((item) => [
              item.pattern,
              String(item.count),
              `${item.acceptanceRate}%`,
            ])}
          />
        </div>
      </div>
      <div className="workspace">
        <div className="panel wide">
          <h2>Confidence Accuracy Trends</h2>
          <Table
            rows={learning.confidenceAccuracyTrends.map((item) => [
              item.bucket,
              `${item.acceptanceRate}%`,
              `${item.count} decisions`,
            ])}
          />
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
  return (
    <Grid
      items={[
        ['Repository size', `${stats?.repositorySizeBytes ?? 0} bytes`],
        ['Indexed files', stats?.indexedFiles ?? 0],
        ['Tokens before retrieval', stats?.estimatedTokensBeforeRetrieval ?? 0],
        ['Tokens after retrieval', stats?.estimatedTokensAfterRetrieval ?? 0],
        ['Token reduction', `${stats?.tokenReductionPercent ?? 100}%`],
        ['Processing time', `${stats?.processingTimeMs ?? 0} ms`],
      ]}
    />
  );
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
  busy,
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
  closePullRequest: (deleteRemoteBranch: boolean) => void;
  busy: boolean;
}) {
  const setupCommand = 'gh auth login --web';
  const cliMissing =
    readiness?.blockers.some((blocker) => blocker.includes('GitHub CLI is not installed')) ?? false;
  const authMissing =
    readiness?.blockers.some((blocker) => blocker.includes('GitHub CLI is not authenticated')) ??
    false;
  const canSaveRemote = readiness !== undefined && !cliMissing && !authMissing;
  const signedIn = readiness !== undefined && !cliMissing && !authMissing;
  return (
    <div className="stack">
      <div className="workspace">
        <div className="panel github-login">
          <h2>1. Sign in to GitHub</h2>
          <p className="helper-text">
            Required once per computer. You do not need to edit or type a key into this app.
          </p>
          {cliMissing ? (
            <div className="setup-warning">
              <strong>Install GitHub CLI first</strong>
              <span>
                Install it from{' '}
                <a href="https://cli.github.com/" target="_blank" rel="noreferrer">
                  cli.github.com
                </a>
                , then click Check setup again.
              </span>
            </div>
          ) : signedIn ? (
            <div className="setup-explanation">
              <strong>GitHub sign-in complete</strong>
              <span>
                GitHub CLI is authenticated on this computer. Continue to confirm the repository
                URL.
              </span>
            </div>
          ) : (
            <div className="setup-explanation">
              <strong>What Sign in with GitHub does</strong>
              <span>
                Opens a visible GitHub CLI sign-in session. Follow its prompts and browser login;
                the app never stores your GitHub password or token.
              </span>
            </div>
          )}
          <div className="next-actions">
            <button
              className="primary"
              onClick={startLogin}
              disabled={busy || cliMissing || loginPending || signedIn}
            >
              {cliMissing
                ? 'Install GitHub CLI first'
                : signedIn
                  ? 'Signed in to GitHub'
                  : loginPending
                    ? 'Waiting for sign-in…'
                    : 'Sign in with GitHub'}
            </button>
            <button onClick={() => navigator.clipboard.writeText(setupCommand)}>
              Copy sign-in command
            </button>
            <button onClick={refresh} disabled={busy}>
              Check setup again
            </button>
          </div>
          {loginPending && (
            <p className="helper-text">
              Checking GitHub CLI automatically every few seconds. This page will update when
              sign-in is complete.
            </p>
          )}
          <details className="command-details">
            <summary>Show the technical command</summary>
            <code>{setupCommand}</code>
          </details>
        </div>
        <div className="panel wide repository-setup">
          <h2>2. Confirm the GitHub repository</h2>
          <p className="helper-text">
            After you sign in, confirm where draft pull requests should be created.
          </p>
          <div className="recording-controls">
            <input
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
              placeholder="https://github.com/owner/repository.git"
              disabled={busy || !canSaveRemote}
            />
            <button onClick={saveRemote} disabled={busy || !remote.trim() || !canSaveRemote}>
              Save repository URL
            </button>
          </div>
          {canSaveRemote ? (
            <div className="setup-explanation">
              <strong>What Save repository URL does</strong>
              <span>
                It updates this project’s local Git <code>origin</code> remote. It does not upload
                code, commit files, or create a pull request.
              </span>
            </div>
          ) : (
            <div className="setup-warning">
              <strong>Sign in first</strong>
              <span>
                Repository saving is enabled after GitHub CLI is installed and you have signed in,
                so the platform can verify the destination.
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="panel wide">
        <h2>GitHub pull request</h2>
        <p className="helper-text">
          When you approve a proposal, the platform commits only the generated files, pushes a new
          automation branch, and creates a draft GitHub pull request.
        </p>
        {readiness && (
          <div className="branch-status" aria-label="Git branch status">
            <span>
              <strong>Current branch:</strong> <code>{readiness.branch ?? 'Not detected'}</code>
            </span>
            <span>
              <strong>Default branch:</strong> <code>{readiness.baseBranch ?? 'Not detected'}</code>
            </span>
          </div>
        )}
        {pullRequest ? (
          <>
            <div className="pull-request-link">
              <a href={pullRequest.url} target="_blank" rel="noreferrer">
                Open draft pull request ↗
              </a>
              <span>
                Open GitHub to review, mark it ready for review, request reviewers, or merge it.
              </span>
            </div>
            <Table
              rows={[
                ['Branch', pullRequest.branch],
                ['Latest commit', pullRequest.commit || 'Existing draft pull request'],
                ['Next approval', 'Adds another commit to this same draft pull request'],
              ]}
            />
            <div className="pull-request-actions">
              <div>
                <strong>Changed your mind?</strong>
                <span>
                  Close PR keeps the branch and files, so it can be reopened or reused later.
                </span>
              </div>
              <button onClick={() => closePullRequest(false)} disabled={busy}>
                Close PR
              </button>
              <button className="danger" onClick={() => closePullRequest(true)} disabled={busy}>
                Close PR & delete remote branch
              </button>
            </div>
          </>
        ) : closedPullRequest ? (
          <div className="setup-explanation">
            <strong>Pull request closed</strong>
            <span>
              {closedPullRequest.remoteBranchDeleted
                ? 'The remote automation branch was deleted. Your local branch and files were kept.'
                : 'The branch and files were kept, so they can be reused later.'}
            </span>
          </div>
        ) : readiness ? (
          <>
            <Metric label="Ready to create PR" value={readiness.ready ? 'Yes' : 'Setup required'} />
            {!readiness.ready && (
              <Table rows={readiness.blockers.map((blocker) => ['Before approval', blocker])} />
            )}
          </>
        ) : (
          <Empty label="Checking GitHub pull request setup…" />
        )}
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
  return pageRoutes.get(key) ?? legacyPageRoutes[key] ?? 'Start Here';
}

function hashForPage(page: string): string {
  return `#/${slugify(page)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function readStagedProposals(): StagedProposal[] {
  try {
    const stored = window.localStorage.getItem(batchStorageKey);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (proposal): proposal is StagedProposal =>
        typeof proposal?.id === 'string' &&
        typeof proposal?.workflowName === 'string' &&
        typeof proposal?.approvalAllowed === 'boolean' &&
        typeof proposal?.approvalReason === 'string' &&
        Array.isArray(proposal?.files) &&
        proposal.files.every(
          (file: unknown) =>
            typeof (file as { path?: unknown })?.path === 'string' &&
            typeof (file as { content?: unknown })?.content === 'string',
        ),
    );
  } catch {
    return [];
  }
}

function canApproveAnalysis(analysis: AnalysisResponse): boolean {
  return analysis.quality.passed && ['auto', 'approval'].includes(analysis.confidence.band);
}

function approvalReason(analysis: AnalysisResponse): string {
  if (!analysis.quality.passed) return 'One or more project quality checks did not pass.';
  if (analysis.confidence.band === 'high-risk') return 'The confidence score is high risk.';
  if (analysis.confidence.band === 'recommendation')
    return 'This is a recommendation only and requires a safer re-analysis.';
  return 'Ready for approval.';
}

function batchCanBeApproved(
  stagedProposals: StagedProposal[],
  analysis?: AnalysisResponse,
): boolean {
  const currentAllowed = analysis ? canApproveAnalysis(analysis) : true;
  return currentAllowed && stagedProposals.every((proposal) => proposal.approvalAllowed);
}

function sameFilePaths(files: Array<{ path: string }>, paths: string[]): boolean {
  const left = [...new Set(files.map((file) => file.path))].sort();
  const right = [...new Set(paths)].sort();
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function workflowCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'workflow' : 'workflows'}`;
}

function pageDescription(active: string, analysis?: AnalysisResponse, execution?: any): string {
  if (active === 'Review & Approve' && !analysis)
    return 'Analyze a script first, then use this page to review its proposal before approving it.';
  if (active === 'Run Tests' && execution)
    return 'Review the latest test run and its logs. If it failed, the suggested next step appears below.';
  return tabDescriptions[active] ?? 'Choose a tab from the sidebar to continue.';
}

const tabDescriptions: Record<string, string> = {
  'Start Here': 'A guided overview of the workflow and the next action to take.',
  'Create Test':
    'Create a script by uploading or pasting one, or record a new script from a URL with Playwright Codegen.',
  'Project Library':
    'See what tests, workflows, page objects, locators, and accessibility checks already exist in this project.',
  'Index Dashboard': 'See when the project scan last ran and how much automation code it found.',
  'Governance Dashboard':
    'Check whether the project follows naming, folder, locator, and accessibility rules.',
  'Review & Approve':
    'Review why a proposed change was suggested, preview its files, and approve it only when it is correct.',
  'Functional Tests': 'Preview the functional test file that would be created after approval.',
  'Accessibility Tests':
    'Preview the accessibility test file that would be created after approval.',
  'Proposed Files': 'Review every generated or updated file, grouped by its destination folder.',
  'Run Tests': 'Run the approved tests and choose whether to include accessibility tests.',
  'Self-Healing Console': 'See suggested next steps when the most recent test run fails.',
  'AI Insights':
    'See the limited information used for optional AI review; raw repository code is not sent to AI.',
  'Learning Dashboard':
    'See aggregate patterns from approved project decisions and successful outcomes.',
  'Token Analytics':
    'See how indexing reduces the amount of project information needed for analysis.',
  'Git & Pull Requests':
    'Check GitHub setup and see the draft pull request created automatically after approval.',
};

function collectPatterns(analysis: AnalysisResponse): string[] {
  const haystack = [
    analysis.proposedChange.auditSummary,
    ...analysis.proposedChange.files.map((file) => `${file.path}\n${file.content}`),
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
  return (
    <div className="grid">
      {items.map(([label, value]) => (
        <Metric key={label} label={label} value={String(value)} />
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Table({ rows }: { rows: Array<Array<string>> }) {
  return (
    <div className="table">
      {rows.length ? (
        rows.map((row, i) => (
          <div className="row" key={i}>
            {row.map((cell, j) => (
              <span key={j}>{cell}</span>
            ))}
          </div>
        ))
      ) : (
        <Empty label="No findings." />
      )}
    </div>
  );
}

function CodePanel({ title, code }: { title: string; code: string }) {
  return (
    <div className="panel wide">
      <h2>{title}</h2>
      <pre>{code}</pre>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="empty">{label}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
