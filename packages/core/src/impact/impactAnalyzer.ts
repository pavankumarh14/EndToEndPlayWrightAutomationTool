import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ChangeImpactReport } from '../types/domain.js';

export class ImpactAnalyzer {
  constructor(private readonly repositoryRoot: string) {}

  async analyze(proposedFiles: Array<{ path: string; content: string }>): Promise<ChangeImpactReport> {
    const createdFiles: string[] = [];
    const updatedFiles: string[] = [];
    const changedFiles = new Set<string>();
    const reusedAssets = new Set<string>();

    for (const file of proposedFiles) {
      const normalized = normalize(file.path);
      changedFiles.add(normalized);
      if (await fileExists(path.join(this.repositoryRoot, normalized))) updatedFiles.push(normalized);
      else createdFiles.push(normalized);
      for (const importedFile of importsFrom(file.content, normalized)) {
        const isExistingAsset = await fileExists(path.join(this.repositoryRoot, importedFile));
        if (isExistingAsset && !changedFiles.has(importedFile) && (importedFile.startsWith('pages/') || importedFile.startsWith('components/'))) {
          reusedAssets.add(importedFile);
        }
      }
    }

    const affectedTests = new Set<string>();
    const affectedPageObjects = new Set<string>();
    for (const sourceFile of await this.sourceFiles()) {
      if (changedFiles.has(sourceFile)) continue;
      const source = await fs.readFile(path.join(this.repositoryRoot, sourceFile), 'utf8');
      const imports = importsFrom(source, sourceFile);
      if (!imports.some((importedFile) => changedFiles.has(importedFile))) continue;
      if (sourceFile.startsWith('tests/')) affectedTests.add(sourceFile);
      if (sourceFile.startsWith('pages/') || sourceFile.startsWith('components/')) affectedPageObjects.add(sourceFile);
    }

    const risk = updatedFiles.some((file) => file.startsWith('pages/') || file.startsWith('components/')) || affectedTests.size > 5
      ? 'high'
      : updatedFiles.length || affectedTests.size || reusedAssets.size
        ? 'medium'
        : 'low';
    const summary = risk === 'low'
      ? 'This proposal creates new automation files and does not change existing project assets.'
      : `${updatedFiles.length} existing file${updatedFiles.length === 1 ? '' : 's'} and ${affectedTests.size} existing test${affectedTests.size === 1 ? '' : 's'} may be affected.`;

    return {
      risk,
      createdFiles,
      updatedFiles,
      affectedTests: [...affectedTests].sort(),
      affectedPageObjects: [...affectedPageObjects].sort(),
      reusedAssets: [...reusedAssets].sort(),
      summary,
      limitation: 'This is the proposed source-file scope. Run the approved test to confirm the live application behavior.'
    };
  }

  private async sourceFiles(): Promise<string[]> {
    const files: string[] = [];
    for (const root of ['tests', 'pages', 'components', 'fixtures', 'utils']) {
      await walk(path.join(this.repositoryRoot, root), root, files);
    }
    return files.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
  }
}

function importsFrom(source: string, importingFile: string): string[] {
  const imports = [...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
  return imports.map((specifier) => resolveImport(importingFile, specifier));
}

function resolveImport(importingFile: string, specifier: string): string {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importingFile), specifier));
  return normalize(resolved.replace(/\.(ts|tsx|js|jsx)$/, '') + '.ts');
}

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(absolute: string, relative: string, files: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(childAbsolute, childRelative, files);
      if (entry.isFile()) files.push(normalize(childRelative));
    }
  } catch {
    return;
  }
}
