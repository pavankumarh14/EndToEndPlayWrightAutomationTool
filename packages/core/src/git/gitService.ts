import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface PullRequestReadiness {
  ready: boolean;
  branch?: string;
  baseBranch?: string;
  remote?: string;
  existingPullRequest?: {
    url: string;
    branch: string;
    isDraft: boolean;
  };
  blockers: string[];
}

export interface CreatePullRequestInput {
  files: string[];
  title: string;
  body: string;
}

export interface CreatedPullRequest {
  url: string;
  branch: string;
  baseBranch: string;
  commit: string;
  updated: boolean;
  returnedToDefaultBranch: boolean;
}

export interface ClosedPullRequest {
  url: string;
  branch: string;
  remoteBranchDeleted: boolean;
}

export class GitService {
  constructor(private readonly cwd: string) {}

  async diff(): Promise<string> {
    return this.run(['diff', '--']);
  }

  async status(): Promise<string> {
    return this.run(['status', '--short']);
  }

  async commit(message: string): Promise<string> {
    await this.run(['add', '.']);
    return this.run(['commit', '-m', message]);
  }

  async pullRequestReadiness(): Promise<PullRequestReadiness> {
    const blockers: string[] = [];
    const branch = await this.tryRun('git', ['branch', '--show-current']);
    const remote = await this.tryRun('git', ['remote', 'get-url', 'origin']);
    const ghVersion = await this.tryRun('gh', ['--version']);
    const authenticated = ghVersion ? await this.tryRun('gh', ['auth', 'status']) : undefined;
    const baseBranch = authenticated ? await this.tryRun('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']) : undefined;
    const existingPullRequest = authenticated ? await this.currentAutomationPullRequest(branch) : undefined;

    if (!branch) blockers.push('Git has no current branch.');
    if (!remote) blockers.push('No GitHub remote named origin is configured.');
    if (!ghVersion) blockers.push('GitHub CLI is not installed. Install it from https://cli.github.com/.');
    if (ghVersion && !authenticated) blockers.push('GitHub CLI is not authenticated. Run gh auth login.');
    if (authenticated && !baseBranch) blockers.push('Could not identify the repository default branch through GitHub CLI.');
    if (branch && baseBranch && branch !== baseBranch && !existingPullRequest) {
      blockers.push(`Current branch is ${branch}, but the repository default branch is ${baseBranch}. Switch to ${baseBranch} before approving so the platform can create a new isolated pull-request branch. If this is an existing automation pull request, click Check setup again so the platform can find it.`);
    }

    return {
      ready: blockers.length === 0,
      branch: branch || undefined,
      baseBranch: baseBranch || undefined,
      remote: remote || undefined,
      existingPullRequest,
      blockers
    };
  }

  async setOrigin(remote: string): Promise<PullRequestReadiness> {
    if (!isGitHubRemote(remote)) {
      throw new Error('Enter a valid GitHub repository URL, such as https://github.com/owner/repository.git.');
    }
    const existing = await this.tryRun('git', ['remote', 'get-url', 'origin']);
    if (existing) {
      await this.run(['remote', 'set-url', 'origin', remote]);
    } else {
      await this.run(['remote', 'add', 'origin', remote]);
    }
    return this.pullRequestReadiness();
  }

  async startGitHubLogin(): Promise<string> {
    if (!(await this.tryRun('gh', ['--version']))) {
      throw new Error('GitHub CLI is not installed. Install it from https://cli.github.com/ and try again.');
    }
    const loginArgs = ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https'];
    if (process.platform === 'darwin') {
      const command = `gh ${loginArgs.join(' ')}`;
      const terminal = spawn('osascript', [
        '-e', 'tell application "Terminal" to activate',
        '-e', `tell application "Terminal" to do script "${command}"`
      ], {
        cwd: this.cwd,
        detached: true,
        stdio: 'ignore'
      });
      terminal.unref();
      return 'A Terminal window was opened for GitHub CLI sign-in. Complete the prompts there; GitHub CLI will open the browser login page.';
    }

    const child = spawn('gh', loginArgs, {
      cwd: this.cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    return 'GitHub CLI sign-in was started. Complete the prompts in the GitHub CLI window, then check setup again.';
  }

  async createDraftPullRequest(input: CreatePullRequestInput): Promise<CreatedPullRequest> {
    const readiness = await this.pullRequestReadiness();
    if (!readiness.ready || !readiness.branch || !readiness.baseBranch) {
      throw new Error(`Cannot create a GitHub pull request: ${readiness.blockers.join(' ')}`);
    }
    const files = this.validateFiles(input.files);
    const changed = await this.run(['status', '--porcelain', '--', ...files]);
    if (!changed.trim()) throw new Error('None of the approved generated files have changes to commit.');

    if (readiness.existingPullRequest) {
      const targetBranch = readiness.existingPullRequest.branch;
      if (readiness.branch !== targetBranch) await this.run(['checkout', targetBranch]);
      await this.run(['add', '--', ...files]);
      await this.run(['commit', '-m', input.title]);
      const commit = await this.run(['rev-parse', '--short', 'HEAD']);
      await this.run(['push', 'origin', targetBranch]);
      return {
        url: readiness.existingPullRequest.url,
        branch: readiness.existingPullRequest.branch,
        baseBranch: readiness.baseBranch,
        commit: commit.trim(),
        updated: true,
        returnedToDefaultBranch: await this.returnToDefaultBranch(readiness.baseBranch)
      };
    }

    const branch = `automation/${slugify(input.title)}-${Date.now().toString(36)}`;
    await this.run(['checkout', '-b', branch]);
    await this.run(['add', '--', ...files]);
    await this.run(['commit', '-m', input.title]);
    const commit = await this.run(['rev-parse', '--short', 'HEAD']);
    await this.run(['push', '-u', 'origin', branch]);
    const output = await this.runGh([
      'pr',
      'create',
      '--draft',
      '--base',
      readiness.baseBranch,
      '--head',
      branch,
      '--title',
      input.title,
      '--body',
      withPlatformMarker(input.body)
    ]);
    const url = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
    if (!url) throw new Error(`GitHub did not return a pull request URL: ${output}`);
    return {
      url,
      branch,
      baseBranch: readiness.baseBranch,
      commit: commit.trim(),
      updated: false,
      returnedToDefaultBranch: await this.returnToDefaultBranch(readiness.baseBranch)
    };
  }

  async closePullRequest(input: { url: string; branch: string; deleteRemoteBranch: boolean }): Promise<ClosedPullRequest> {
    if (!/^https:\/\/github\.com\/[^\s]+\/pull\/\d+$/.test(input.url)) {
      throw new Error('Invalid GitHub pull request URL.');
    }
    if (!/^automation\/[a-z0-9][a-z0-9-]*$/i.test(input.branch)) {
      throw new Error('Only automation branches created by this platform can be deleted.');
    }
    if (!(await this.tryRun('gh', ['auth', 'status']))) {
      throw new Error('GitHub CLI is not authenticated. Sign in to GitHub before closing a pull request.');
    }
    await this.runGh(['pr', 'close', input.url]);
    if (input.deleteRemoteBranch) {
      await this.run(['push', 'origin', '--delete', input.branch]);
    }
    return { url: input.url, branch: input.branch, remoteBranchDeleted: input.deleteRemoteBranch };
  }

  private async run(args: string[]): Promise<string> {
    const { stdout, stderr } = await exec('git', args, { cwd: this.cwd });
    return stdout || stderr;
  }

  private async runGh(args: string[]): Promise<string> {
    const { stdout, stderr } = await exec('gh', args, { cwd: this.cwd });
    return stdout || stderr;
  }

  private async tryRun(command: string, args: string[]): Promise<string | undefined> {
    try {
      const { stdout, stderr } = await exec(command, args, { cwd: this.cwd });
      return (stdout || stderr).trim();
    } catch {
      return undefined;
    }
  }

  private validateFiles(files: string[]): string[] {
    if (!Array.isArray(files) || !files.length) throw new Error('At least one approved generated file is required for the pull request.');
    const repositoryPrefix = `${this.cwd}${path.sep}`;
    const unique = [...new Set(files)];
    for (const file of unique) {
      const absolute = path.resolve(this.cwd, file);
      if (!absolute.startsWith(repositoryPrefix)) throw new Error(`Invalid generated file path: ${file}`);
    }
    return unique;
  }

  private async currentAutomationPullRequest(branch?: string): Promise<PullRequestReadiness['existingPullRequest']> {
    if (branch && /^automation\/[a-z0-9][a-z0-9-]*$/i.test(branch)) {
      const current = await this.tryRun('gh', ['pr', 'view', '--json', 'url,state,isDraft,headRefName,body']);
      const parsedCurrent = current ? parsePlatformPullRequest(current) : undefined;
      if (parsedCurrent?.branch === branch) return parsedCurrent;
    }
    const output = await this.tryRun('gh', ['pr', 'list', '--state', 'open', '--json', 'url,headRefName,isDraft,body', '--limit', '100']);
    if (!output) return undefined;
    try {
      const pullRequests = JSON.parse(output) as Array<{ url?: string; headRefName?: string; isDraft?: boolean; body?: string }>;
      const marked = pullRequests.map((pullRequest) => parsePlatformPullRequest(JSON.stringify(pullRequest))).find(Boolean);
      if (marked) return marked;
      // Compatibility for draft PRs created before the Studio marker existed.
      // Only reuse one unambiguous draft automation branch; never guess between several.
      const legacyCandidates = pullRequests.filter((pullRequest) =>
        pullRequest.isDraft === true && Boolean(pullRequest.url) && /^automation\/[a-z0-9][a-z0-9-]*$/i.test(pullRequest.headRefName ?? '')
      );
      if (legacyCandidates.length !== 1) return undefined;
      const legacy = legacyCandidates[0];
      return { url: legacy.url!, branch: legacy.headRefName!, isDraft: true };
    } catch {
      return undefined;
    }
  }

  private async returnToDefaultBranch(branch: string): Promise<boolean> {
    try {
      await this.run(['checkout', branch]);
      return true;
    } catch {
      return false;
    }
  }
}

const platformPullRequestMarker = '<!-- playwright-automation-studio -->';

function withPlatformMarker(body: string): string {
  return body.includes(platformPullRequestMarker) ? body : `${body}\n\n${platformPullRequestMarker}`;
}

function parsePlatformPullRequest(value: string): PullRequestReadiness['existingPullRequest'] | undefined {
  try {
    const pullRequest = JSON.parse(value) as { url?: string; state?: string; isDraft?: boolean; headRefName?: string; body?: string };
    if (pullRequest.state && pullRequest.state !== 'OPEN') return undefined;
    if (!pullRequest.url || !pullRequest.isDraft || !pullRequest.headRefName?.match(/^automation\/[a-z0-9][a-z0-9-]*$/i)) return undefined;
    if (!pullRequest.body?.includes(platformPullRequestMarker)) return undefined;
    return { url: pullRequest.url, branch: pullRequest.headRefName, isDraft: true };
  } catch {
    return undefined;
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'automation-update';
}

function isGitHubRemote(value: string): boolean {
  return /^(?:https:\/\/github\.com\/[^\s/]+\/[^\s/]+(?:\.git)?|git@github\.com:[^\s/]+\/[^\s/]+(?:\.git)?)\/?$/.test(value.trim());
}
