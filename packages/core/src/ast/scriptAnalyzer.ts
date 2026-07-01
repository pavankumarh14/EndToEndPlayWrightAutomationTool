import { createHash } from 'node:crypto';
import { ActionModel, AssertionModel, WorkflowModel } from '../types/domain.js';
import { extractLocators } from './locatorExtractor.js';

export interface ParsedScript {
  language: 'typescript' | 'javascript' | 'unknown';
  workflows: WorkflowModel[];
}

export function analyzeUploadedScript(source: string, sourceFile = 'upload.spec.ts'): ParsedScript {
  const actions = extractActions(source, sourceFile);
  const assertions = extractAssertions(source);
  const navigation = [...source.matchAll(/\.goto\((['"`][^'"`]+['"`])\)/g)].map((m) => trim(m[1]));
  const tags = [...source.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => m[0]);
  const dataUsage = [...source.matchAll(/\b(?:process\.env|testData|fixture|fixtures|users?)\b/g)].map((m) => m[0]);
  const name = extractTestName(source) ?? deriveWorkflowName(actions, navigation);

  return {
    language: detectLanguage(sourceFile, source),
    workflows: [
      {
        id: hash(`${sourceFile}:${name}:${actions.length}:${assertions.length}`),
        name,
        intent: summarizeIntent(name, actions, assertions, navigation),
        sourceFile,
        actions,
        assertions,
        navigation,
        tags: [...new Set(tags)],
        dataUsage: [...new Set(dataUsage)]
      }
    ]
  };
}

function extractActions(source: string, filePath: string): ActionModel[] {
  const actionPattern = /\.(click|fill|check|uncheck|selectOption|press|hover|dragTo|setInputFiles)\(([^)]*)\)/g;
  const actions: ActionModel[] = [];

  source.split('\n').forEach((line, lineIndex) => {
    for (const match of line.matchAll(actionPattern)) {
      actions.push({
        id: hash(`${filePath}:action:${lineIndex}:${match.index}:${match[1]}`),
        kind: match[1],
        value: trim(match[2] ?? ''),
        locator: extractLocators(line, filePath)[0],
        line: lineIndex + 1
      });
    }
  });

  return actions;
}

function extractAssertions(source: string): AssertionModel[] {
  const assertions: AssertionModel[] = [];
  const assertionPattern = /await\s+expect\((.*)\)\.(toBeVisible|toHaveText|toContainText|toHaveURL|toBeEnabled|toHaveAttribute|toBeChecked)\((.*)\);?/;
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    const match = line.trim().match(assertionPattern);
    if (!match) return;
    assertions.push({
      id: hash(`assertion:${index}:${match[2]}`),
      kind: match[2],
      target: trim(match[1]),
      expected: trim(match[3] ?? ''),
      line: index + 1
    });
  });
  return assertions;
}

function extractTestName(source: string): string | undefined {
  return trim(source.match(/test(?:\.describe)?\((['"`][^'"`]+['"`])/)?.[1] ?? '');
}

function deriveWorkflowName(actions: ActionModel[], navigation: string[]): string {
  const firstUrl = navigation[0] ? new URLish(navigation[0]).label : 'uploaded workflow';
  const actionSummary = actions.slice(0, 3).map((a) => a.kind).join(' ');
  return `${firstUrl} ${actionSummary}`.trim();
}

function summarizeIntent(
  name: string,
  actions: ActionModel[],
  assertions: AssertionModel[],
  navigation: string[]
): string {
  return [
    `Workflow ${name}`,
    navigation.length ? `navigates to ${navigation.join(', ')}` : undefined,
    actions.length ? `performs ${actions.map((a) => a.kind).join(', ')}` : undefined,
    assertions.length ? `validates ${assertions.map((a) => a.kind).join(', ')}` : undefined
  ]
    .filter(Boolean)
    .join('; ');
}

function detectLanguage(filePath: string, source: string): ParsedScript['language'] {
  if (filePath.endsWith('.ts') || source.includes(': Page') || source.includes('import type')) return 'typescript';
  if (filePath.endsWith('.js')) return 'javascript';
  return 'unknown';
}

function trim(value: string): string {
  return value.trim().replace(/^['"`]/, '').replace(/['"`]$/, '');
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

class URLish {
  readonly label: string;

  constructor(value: string) {
    this.label = value.replace(/^https?:\/\//, '').split(/[/?#]/)[0] || 'uploaded workflow';
  }
}
