import { execFile } from 'node:child_process';
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

export class ExecutionService {
  constructor(private readonly cwd: string) {}

  async runPlaywright(options: PlaywrightRunOptions = {}): Promise<ExecutionResult> {
    const testFiles = await selectedTestFiles(this.cwd, options);
    const command = playwrightCommand(options);
    let result = await this.executePlaywright(options);
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

      result = await this.executePlaywright(options);
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
