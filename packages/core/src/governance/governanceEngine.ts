import path from 'node:path';
import { GovernanceReport, GovernanceViolation, LocatorModel, ProposedChange } from '../types/domain.js';

export class GovernanceEngine {
  validateChange(change: Pick<ProposedChange, 'files'>): GovernanceReport {
    const violations: GovernanceViolation[] = [];
    for (const file of change.files) {
      violations.push(...validateFolder(file.path), ...validateNaming(file.path), ...validateRawLocatorUsage(file));
    }
    return {
      passed: !violations.some((violation) => violation.severity === 'blocker'),
      violations
    };
  }

  validateLocators(locators: LocatorModel[]): GovernanceReport {
    const duplicates = new Map<string, number>();
    for (const locator of locators) duplicates.set(locator.raw, (duplicates.get(locator.raw) ?? 0) + 1);
    const violations = locators.flatMap((locator) =>
      locator.warnings.map<GovernanceViolation>((warning) => ({
        severity: locator.strategy === 'xpath' ? 'blocker' : 'warning',
        rule: 'locator-priority',
        message: warning,
        filePath: locator.filePath
      }))
    );
    for (const [raw, count] of duplicates) {
      if (count > 1) {
        violations.push({
          severity: 'warning',
          rule: 'duplicate-locator',
          message: `Duplicate locator detected: ${raw}`
        });
      }
    }
    return { passed: !violations.some((v) => v.severity === 'blocker'), violations };
  }
}

function validateFolder(filePath: string): GovernanceViolation[] {
  const allowed = [
    'tests/functional/',
    'tests/accessibility/',
    'pages/',
    'components/',
    'fixtures/',
    'utils/'
  ];
  if (allowed.some((prefix) => filePath.startsWith(prefix))) return [];
  return [{ severity: 'blocker', rule: 'folder-standard', message: `File is outside approved folders: ${filePath}`, filePath }];
}

function validateNaming(filePath: string): GovernanceViolation[] {
  const name = path.basename(filePath);
  if (filePath.startsWith('pages/') && !/^[A-Z][A-Za-z0-9]+Page\.ts$/.test(name)) {
    return [{ severity: 'blocker', rule: 'page-naming', message: 'Page objects must be named LoginPage.ts style', filePath }];
  }
  if (filePath.startsWith('components/') && !/^[A-Z][A-Za-z0-9]+Component\.ts$/.test(name)) {
    return [{ severity: 'blocker', rule: 'component-naming', message: 'Components must be named HeaderComponent.ts style', filePath }];
  }
  if (filePath.startsWith('tests/functional/') && !/^[a-z0-9-]+\.spec\.ts$/.test(name)) {
    return [{ severity: 'warning', rule: 'test-naming', message: 'Functional tests should use login.spec.ts style', filePath }];
  }
  if (filePath.startsWith('tests/accessibility/') && !/^[a-z0-9-]+\.a11y\.spec\.ts$/.test(name)) {
    return [{ severity: 'warning', rule: 'a11y-naming', message: 'Accessibility tests should use login.a11y.spec.ts style', filePath }];
  }
  return [];
}

function validateRawLocatorUsage(file: { path: string; content: string }): GovernanceViolation[] {
  if (!file.path.startsWith('tests/')) return [];
  if (/page\.(locator|getByRole|getByLabel|getByText|getByTestId|getByPlaceholder)\(/.test(file.content)) {
    return [{
      severity: 'blocker',
      rule: 'no-raw-locators-in-tests',
      message: 'Tests must express business workflow calls through page objects, not raw locators',
      filePath: file.path
    }];
  }
  return [];
}
