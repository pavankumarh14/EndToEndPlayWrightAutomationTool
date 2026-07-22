import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface PlaywrightRunOptions {
  filter?: string;
  testFiles?: string[];
  installMissingDependencies?: boolean;
  maxDependencyInstallAttempts?: number;
  runAccessibilityWithFunctional?: boolean;
}

export interface ExecutionInstallAction {
  type: 'npm-package' | 'playwright-browser';
  name: string;
  command: string;
  success: boolean;
  logs: string;
}

export interface ExecutionResult {
  passed: boolean;
  logs: string;
  command: string;
  testFiles: string[];
  accessibilityWithFunctional: boolean;
  attemptedDependencyInstall: boolean;
  retried: boolean;
  installActions: ExecutionInstallAction[];
  artifacts: {
    reportPath: string;
    tracesPath: string;
  };
}

export interface ProposedTestFile {
  path: string;
  content: string;
}

export class ExecutionService {
  constructor(private readonly cwd: string) {}

  async runPlaywright(options: PlaywrightRunOptions = {}): Promise<ExecutionResult> {
    const testFiles = await selectedTestFiles(this.cwd, options);
    if (!testFiles.length) {
      throw new Error(
        'No approved tests are available on the current branch. Analyze a script and choose “Current reviewed proposal” to test it before approval.',
      );
    }
    return this.runTestFiles(testFiles, options);
  }

  /** Runs an uploaded Codegen script without adding it to the repository. */
  async runUploadedScript(
    source: string,
    fileName = 'uploaded.spec.ts',
    options: PlaywrightRunOptions = {},
  ): Promise<ExecutionResult> {
    if (!source.trim()) throw new Error('An uploaded script is required to run a preview.');
    const extension = path.extname(fileName).match(/^\.(?:ts|tsx|js|jsx)$/i)?.[0] ?? '.ts';
    const relativePath = `storage/runs/upload-preview-${randomUUID()}.spec${extension}`;
    const absolutePath = path.join(this.cwd, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, source, 'utf8');
    try {
      return await this.runTestFiles([relativePath], options);
    } finally {
      await fs.rm(absolutePath, { force: true });
    }
  }

  /**
   * Tests a reviewed proposal before approval. Proposed files temporarily overlay
   * matching repository paths and are always restored afterwards.
   */
  async runProposedFiles(
    files: ProposedTestFile[],
    options: PlaywrightRunOptions = {},
  ): Promise<ExecutionResult> {
    if (!files.length) throw new Error('There are no proposed files to test.');
    const repositoryPrefix = `${this.cwd}${path.sep}`;
    const originals = new Map<string, string | undefined>();
    for (const file of files) {
      const absolute = path.resolve(this.cwd, file.path);
      if (!absolute.startsWith(repositoryPrefix) || !/^(pages|components|tests)\//.test(file.path)) {
        throw new Error(`Invalid proposed file path: ${file.path}`);
      }
      try {
        originals.set(file.path, await fs.readFile(absolute, 'utf8'));
      } catch {
        originals.set(file.path, undefined);
      }
    }

    const testFiles = files
      .map((file) => file.path)
      .filter((file) => /\.(spec|test)\.(ts|tsx|js|jsx)$/.test(file))
      .filter((file) => options.runAccessibilityWithFunctional === true || file.startsWith('tests/functional/'));
    if (!testFiles.length) throw new Error('The proposal does not include a runnable functional test file.');

    try {
      for (const file of files) {
        const absolute = path.resolve(this.cwd, file.path);
        await fs.mkdir(path.dirname(absolute), { recursive: true });
        await fs.writeFile(absolute, file.content, 'utf8');
      }
      return await this.runTestFiles(testFiles, options);
    } finally {
      for (const [filePath, original] of originals) {
        const absolute = path.resolve(this.cwd, filePath);
        if (original === undefined) await fs.rm(absolute, { force: true });
        else await fs.writeFile(absolute, original, 'utf8');
      }
    }
  }

  private async runTestFiles(
    testFiles: string[],
    options: PlaywrightRunOptions,
  ): Promise<ExecutionResult> {
    const runOptions = { ...options, testFiles };
    const command = playwrightCommand(runOptions);
    let result = await this.executePlaywright(runOptions);
    const installActions: ExecutionInstallAction[] = [];
    const maxAttempts = options.maxDependencyInstallAttempts ?? 3;

    if (result.passed || !options.installMissingDependencies) {
      return {
        ...result,
        command,
        testFiles,
        accessibilityWithFunctional: options.runAccessibilityWithFunctional === true,
        attemptedDependencyInstall: false,
        retried: false,
        installActions,
      };
    }

    const runLogs: string[] = [result.logs];

    for (let attempt = 0; attempt < maxAttempts && !result.passed; attempt += 1) {
      const installAction = await this.installMissingDependency(result.logs, installActions);
      if (!installAction) break;

      installActions.push(installAction);
      if (!installAction.success) {
        return {
          ...result,
          command,
          testFiles,
          accessibilityWithFunctional: options.runAccessibilityWithFunctional === true,
          logs: [...runLogs, `Dependency install failed:\n${installAction.logs}`].join('\n\n'),
          attemptedDependencyInstall: true,
          retried: installActions.length > 1,
          installActions,
        };
      }

      result = await this.executePlaywright(runOptions);
      runLogs.push(`Installed missing dependency with: ${installAction.command}`);
      runLogs.push(`Retry output:\n${result.logs}`);
    }

    return {
      ...result,
      command,
      testFiles,
      accessibilityWithFunctional: options.runAccessibilityWithFunctional === true,
      logs: runLogs.join('\n\n'),
      attemptedDependencyInstall: installActions.length > 0,
      retried: installActions.length > 0,
      installActions,
    };
  }

  private async executePlaywright(
    options: PlaywrightRunOptions,
  ): Promise<
    Omit<
      ExecutionResult,
      | 'command'
      | 'testFiles'
      | 'accessibilityWithFunctional'
      | 'attemptedDependencyInstall'
      | 'retried'
      | 'installActions'
    >
  > {
    try {
      const args = [
        'playwright',
        'test',
        ...(options.testFiles?.length
          ? options.testFiles
          : options.runAccessibilityWithFunctional
            ? []
            : ['tests/functional']),
        ...(options.filter ? ['-g', options.filter] : []),
      ];
      const { stdout, stderr } = await exec('npx', args, {
        cwd: this.cwd,
        env: this.playwrightEnv(options),
      });
      return { passed: true, logs: stdout || stderr, artifacts: artifactPaths() };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      return {
        passed: false,
        logs: `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
        artifacts: artifactPaths(),
      };
    }
  }

  private playwrightEnv(_options: PlaywrightRunOptions): NodeJS.ProcessEnv {
    return {
      ...process.env,
    };
  }

  private async installMissingDependency(
    logs: string,
    previousActions: ExecutionInstallAction[],
  ): Promise<ExecutionInstallAction | undefined> {
    const missingPackage = findMissingNodePackage(logs);
    if (missingPackage && !wasInstallAttempted(previousActions, 'npm-package', missingPackage)) {
      return this.installNpmPackage(missingPackage);
    }

    const missingBrowser = findMissingPlaywrightBrowser(logs);
    if (
      missingBrowser &&
      !wasInstallAttempted(previousActions, 'playwright-browser', missingBrowser)
    ) {
      return this.installPlaywrightBrowser(missingBrowser);
    }

    return undefined;
  }

  private async installNpmPackage(packageName: string): Promise<ExecutionInstallAction> {
    const args = ['install', '--save-dev', packageName];
    const command = `npm ${args.join(' ')}`;
    try {
      const { stdout, stderr } = await exec('npm', args, { cwd: this.cwd });
      return {
        type: 'npm-package',
        name: packageName,
        command,
        success: true,
        logs: stdout || stderr,
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      return {
        type: 'npm-package',
        name: packageName,
        command,
        success: false,
        logs: `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
      };
    }
  }

  private async installPlaywrightBrowser(browserName: string): Promise<ExecutionInstallAction> {
    const args = ['playwright', 'install', browserName];
    const command = `npx ${args.join(' ')}`;
    try {
      const { stdout, stderr } = await exec('npx', args, { cwd: this.cwd });
      return {
        type: 'playwright-browser',
        name: browserName,
        command,
        success: true,
        logs: stdout || stderr,
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      return {
        type: 'playwright-browser',
        name: browserName,
        command,
        success: false,
        logs: `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
      };
    }
  }
}

function playwrightCommand(options: PlaywrightRunOptions): string {
  return [
    'npx playwright test',
    options.testFiles?.length
      ? options.testFiles.join(' ')
      : options.runAccessibilityWithFunctional
        ? ''
        : 'tests/functional',
    options.filter ? `-g ${JSON.stringify(options.filter)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

async function discoveredTestFiles(
  repositoryRoot: string,
  includeAccessibility: boolean,
): Promise<string[]> {
  const roots = includeAccessibility ? ['tests'] : ['tests/functional'];
  const files: string[] = [];
  for (const root of roots) await walkTests(path.join(repositoryRoot, root), root, files);
  return files.filter((file) => /\.(spec|test)\.(ts|tsx|js|jsx)$/.test(file)).sort();
}

async function selectedTestFiles(
  repositoryRoot: string,
  options: PlaywrightRunOptions,
): Promise<string[]> {
  if (!options.testFiles?.length)
    return discoveredTestFiles(repositoryRoot, options.runAccessibilityWithFunctional === true);
  const files = [
    ...new Set(options.testFiles.map((file) => file.replace(/\\/g, '/').replace(/^\.\//, ''))),
  ];
  for (const file of files) {
    if (!file.startsWith('tests/') || !/\.(spec|test)\.(ts|tsx|js|jsx)$/.test(file)) {
      throw new Error(`Invalid test file selection: ${file}`);
    }
    const absolute = path.resolve(repositoryRoot, file);
    const testsRoot = `${path.resolve(repositoryRoot, 'tests')}${path.sep}`;
    if (!absolute.startsWith(testsRoot)) throw new Error(`Invalid test file selection: ${file}`);
    try {
      await fs.access(absolute);
    } catch {
      throw new Error(`Selected test file does not exist on the current branch: ${file}`);
    }
  }
  return files.sort();
}

async function walkTests(absolute: string, relative: string, files: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) await walkTests(childAbsolute, childRelative, files);
      if (entry.isFile()) files.push(childRelative.replace(/\\/g, '/'));
    }
  } catch {
    // A fresh project may not have generated test folders yet.
  }
}

function findMissingNodePackage(logs: string): string | undefined {
  const match = logs.match(/Cannot find module ['"]([^'"]+)['"]/);
  if (!match) return undefined;

  const packageName = packageNameFromImport(match[1]);
  return isSafePackageName(packageName) ? packageName : undefined;
}

function packageNameFromImport(importPath: string): string {
  if (importPath.startsWith('@')) return importPath.split('/').slice(0, 2).join('/');
  return importPath.split('/')[0];
}

function isSafePackageName(packageName: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName);
}

function findMissingPlaywrightBrowser(logs: string): string | undefined {
  if (!/playwright install/i.test(logs) && !/Executable doesn't exist/i.test(logs))
    return undefined;
  const browserMatch = logs.match(/browserType\.launch:\s*(chromium|firefox|webkit)/i);
  return browserMatch?.[1]?.toLowerCase() ?? 'chromium';
}

function wasInstallAttempted(
  actions: ExecutionInstallAction[],
  type: ExecutionInstallAction['type'],
  name: string,
): boolean {
  return actions.some((action) => action.type === type && action.name === name);
}

function artifactPaths(): ExecutionResult['artifacts'] {
  return {
    reportPath: 'playwright-report/index.html',
    tracesPath: 'test-results',
  };
}
