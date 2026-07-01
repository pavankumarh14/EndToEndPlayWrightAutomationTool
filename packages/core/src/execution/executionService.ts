import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface PlaywrightRunOptions {
  filter?: string;
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
    let result = await this.executePlaywright(options);
    const installActions: ExecutionInstallAction[] = [];
    const maxAttempts = options.maxDependencyInstallAttempts ?? 3;

    if (result.passed || !options.installMissingDependencies) {
      return {
        ...result,
        accessibilityWithFunctional: options.runAccessibilityWithFunctional === true,
        attemptedDependencyInstall: false,
        retried: false,
        installActions
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
          accessibilityWithFunctional: options.runAccessibilityWithFunctional === true,
          logs: [...runLogs, `Dependency install failed:\n${installAction.logs}`].join('\n\n'),
          attemptedDependencyInstall: true,
          retried: installActions.length > 1,
          installActions
        };
      }

      result = await this.executePlaywright(options);
      runLogs.push(`Installed missing dependency with: ${installAction.command}`);
      runLogs.push(`Retry output:\n${result.logs}`);
    }

    return {
      ...result,
      accessibilityWithFunctional: options.runAccessibilityWithFunctional === true,
      logs: runLogs.join('\n\n'),
      attemptedDependencyInstall: installActions.length > 0,
      retried: installActions.length > 0,
      installActions
    };
  }

  private async executePlaywright(
    options: PlaywrightRunOptions
  ): Promise<Omit<ExecutionResult, 'accessibilityWithFunctional' | 'attemptedDependencyInstall' | 'retried' | 'installActions'>> {
    try {
      const args = ['playwright', 'test', ...(options.filter ? ['-g', options.filter] : [])];
      const { stdout, stderr } = await exec('npx', args, { cwd: this.cwd, env: this.playwrightEnv(options) });
      return { passed: true, logs: stdout || stderr, artifacts: artifactPaths() };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      return { passed: false, logs: `${err.stdout ?? ''}\n${err.stderr ?? ''}`, artifacts: artifactPaths() };
    }
  }

  private playwrightEnv(options: PlaywrightRunOptions): NodeJS.ProcessEnv {
    return {
      ...process.env,
      RUN_ACCESSIBILITY_WITH_FUNCTIONAL: options.runAccessibilityWithFunctional ? 'true' : 'false'
    };
  }

  private async installMissingDependency(
    logs: string,
    previousActions: ExecutionInstallAction[]
  ): Promise<ExecutionInstallAction | undefined> {
    const missingPackage = findMissingNodePackage(logs);
    if (missingPackage && !wasInstallAttempted(previousActions, 'npm-package', missingPackage)) {
      return this.installNpmPackage(missingPackage);
    }

    const missingBrowser = findMissingPlaywrightBrowser(logs);
    if (missingBrowser && !wasInstallAttempted(previousActions, 'playwright-browser', missingBrowser)) {
      return this.installPlaywrightBrowser(missingBrowser);
    }

    return undefined;
  }

  private async installNpmPackage(packageName: string): Promise<ExecutionInstallAction> {
    const args = ['install', '--save-dev', packageName];
    const command = `npm ${args.join(' ')}`;
    try {
      const { stdout, stderr } = await exec('npm', args, { cwd: this.cwd });
      return { type: 'npm-package', name: packageName, command, success: true, logs: stdout || stderr };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      return { type: 'npm-package', name: packageName, command, success: false, logs: `${err.stdout ?? ''}\n${err.stderr ?? ''}` };
    }
  }

  private async installPlaywrightBrowser(browserName: string): Promise<ExecutionInstallAction> {
    const args = ['playwright', 'install', browserName];
    const command = `npx ${args.join(' ')}`;
    try {
      const { stdout, stderr } = await exec('npx', args, { cwd: this.cwd });
      return { type: 'playwright-browser', name: browserName, command, success: true, logs: stdout || stderr };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      return { type: 'playwright-browser', name: browserName, command, success: false, logs: `${err.stdout ?? ''}\n${err.stderr ?? ''}` };
    }
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
  if (!/playwright install/i.test(logs) && !/Executable doesn't exist/i.test(logs)) return undefined;
  const browserMatch = logs.match(/browserType\.launch:\s*(chromium|firefox|webkit)/i);
  return browserMatch?.[1]?.toLowerCase() ?? 'chromium';
}

function wasInstallAttempted(
  actions: ExecutionInstallAction[],
  type: ExecutionInstallAction['type'],
  name: string
): boolean {
  return actions.some((action) => action.type === type && action.name === name);
}

function artifactPaths(): ExecutionResult['artifacts'] {
  return {
    reportPath: 'playwright-report/index.html',
    tracesPath: 'test-results'
  };
}
