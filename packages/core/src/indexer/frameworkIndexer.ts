import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FrameworkIndex, PageObjectModel, TestModel } from '../types/domain.js';
import { PlatformConfig } from '../types/config.js';
import { analyzeUploadedScript } from '../ast/scriptAnalyzer.js';
import { extractLocators } from '../ast/locatorExtractor.js';

export class FrameworkIndexer {
  constructor(private readonly config: PlatformConfig) {}

  async buildIndex(): Promise<FrameworkIndex> {
    const started = Date.now();
    const files = await this.scanFiles();
    const tests: TestModel[] = [];
    const accessibility: TestModel[] = [];
    const pageObjects: PageObjectModel[] = [];
    const workflows = [];
    const locators = [];
    let repositorySizeBytes = 0;

    for (const file of files) {
      const absolute = path.join(this.config.repositoryRoot, file);
      const source = await fs.readFile(absolute, 'utf8');
      repositorySizeBytes += Buffer.byteLength(source);

      if (file.endsWith('.spec.ts')) {
        const parsed = analyzeUploadedScript(source, file);
        workflows.push(...parsed.workflows);
        const model = {
          name: path.basename(file),
          filePath: file,
          workflows: parsed.workflows.map((workflow) => workflow.name),
          tags: [...new Set(parsed.workflows.flatMap((workflow) => workflow.tags))],
          hasAccessibilityCoverage: file.includes('/accessibility/') || file.includes('.a11y.')
        };
        tests.push(model);
        if (model.hasAccessibilityCoverage) accessibility.push(model);
      }

      if (file.startsWith('pages/') || file.startsWith('components/')) {
        const methodDetails = extractMethodDetails(source);
        pageObjects.push({
          name: path.basename(file, '.ts'),
          filePath: file,
          className: source.match(/export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1],
          methods: methodDetails.map((method) => method.name),
          methodDetails,
          locators: extractLocators(source, file)
        });
      }

      locators.push(...extractLocators(source, file));
    }

    const estimatedTokensBeforeRetrieval = Math.ceil(repositorySizeBytes / 4);
    const estimatedTokensAfterRetrieval = Math.ceil(
      workflows.map((workflow) => workflow.intent).join('\n').length / 4
    );

    return {
      generatedAt: new Date().toISOString(),
      repositoryRoot: this.config.repositoryRoot,
      tests,
      workflows,
      pageObjects,
      locators,
      accessibility,
      tokenStats: {
        repositorySizeBytes,
        indexedFiles: files.length,
        retrievedFiles: 0,
        estimatedTokensBeforeRetrieval,
        estimatedTokensAfterRetrieval,
        tokenReductionPercent:
          estimatedTokensBeforeRetrieval === 0
            ? 100
            : Math.round(
                (1 - estimatedTokensAfterRetrieval / estimatedTokensBeforeRetrieval) * 10000
              ) / 100,
        processingTimeMs: Date.now() - started,
        aiUsageBreakdown: {}
      }
    };
  }

  async persist(index: FrameworkIndex): Promise<void> {
    const output = path.join(this.config.repositoryRoot, this.config.indexOutputPath);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(index, null, 2));
  }

  private async scanFiles(): Promise<string[]> {
    const discovered: string[] = [];
    for (const root of this.config.scanRoots) {
      await walk(path.join(this.config.repositoryRoot, root), root, discovered);
    }
    return discovered.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
  }
}

async function walk(absolute: string, relative: string, discovered: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(childAbsolute, childRelative, discovered);
      if (entry.isFile()) discovered.push(childRelative);
    }
  } catch {
    return;
  }
}

function extractMethodDetails(source: string): Array<{ name: string; parameterCount: number }> {
  return [...source.matchAll(/(?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?::[^ {]+)?\s*{/g)]
    .filter((match) => !['if', 'for', 'while', 'switch', 'constructor'].includes(match[1]))
    .map((match) => ({
      name: match[1],
      parameterCount: match[2].split(',').map((parameter) => parameter.trim()).filter(Boolean).length
    }));
}
