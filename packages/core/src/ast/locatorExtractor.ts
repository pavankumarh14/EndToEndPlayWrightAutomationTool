import { LocatorModel } from '../types/domain.js';

const locatorPatterns: Array<{ strategy: LocatorModel['strategy']; pattern: RegExp; rank: number }> = [
  { strategy: 'role', pattern: /getByRole\(([^)]*)\)/g, rank: 100 },
  { strategy: 'label', pattern: /getByLabel\(([^)]*)\)/g, rank: 95 },
  { strategy: 'placeholder', pattern: /getByPlaceholder\(([^)]*)\)/g, rank: 90 },
  { strategy: 'text', pattern: /getByText\(([^)]*)\)/g, rank: 82 },
  { strategy: 'testId', pattern: /getByTestId\(([^)]*)\)/g, rank: 76 },
  // Codegen commonly records data-test selectors such as
  // locator('[data-test="username"]'). The selector can contain the other
  // quote type, so capture the opening quote and its matching close quote.
  { strategy: 'css', pattern: /locator\(\s*(['"`])([\s\S]*?)\1\s*\)/g, rank: 45 },
  { strategy: 'xpath', pattern: /locator\(\s*(['"`])((?:xpath=)?\/\/[\s\S]*?)\1\s*\)/g, rank: 20 }
];

export function extractLocators(source: string, filePath?: string): LocatorModel[] {
  const locators: LocatorModel[] = [];

  for (const { strategy, pattern, rank } of locatorPatterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[0];
      const value = stripQuotes(match[2] ?? match[1] ?? '');
      const warnings = getLocatorWarnings(strategy, value);
      locators.push({
        id: `${filePath ?? 'upload'}:${match.index ?? 0}:${strategy}`,
        raw,
        strategy,
        value,
        filePath,
        score: Math.max(0, rank - warnings.length * 12),
        warnings
      });
    }
  }

  return dedupeLocators(locators);
}

export function getLocatorWarnings(strategy: LocatorModel['strategy'], value: string): string[] {
  const warnings: string[] = [];
  if (strategy === 'xpath') warnings.push('XPath locator should be replaced with accessible locator');
  if (/^\/\//.test(value) || /^xpath=\/\//.test(value)) warnings.push('Absolute XPath is brittle');
  if (/\[[0-9]+\]/.test(value) || /nth\(|:nth-child/.test(value)) warnings.push('Index-based selector is brittle');
  if (/[a-f0-9]{8,}|css-[a-z0-9]{5,}|_[0-9]{4,}/i.test(value)) warnings.push('Selector appears dynamic');
  if (strategy === 'css') warnings.push('CSS locator is lower priority than role, label, placeholder, text, or test id');
  return warnings;
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"`]/, '').replace(/['"`]$/, '');
}

function dedupeLocators(locators: LocatorModel[]): LocatorModel[] {
  const seen = new Set<string>();
  return locators.filter((locator) => {
    const key = `${locator.strategy}:${locator.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
