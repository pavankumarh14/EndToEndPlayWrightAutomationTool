import { PageObjectModel, WorkflowModel } from '../types/domain.js';

export interface ReusablePageObject {
  pageObject: PageObjectModel;
  businessMethod: string;
  verificationMethod: string;
  reason: string;
}

export function selectReusablePageObject(
  workflow: WorkflowModel,
  candidates: PageObjectModel[],
  preferredAsset?: string
): ReusablePageObject | undefined {
  const workflowTerms = terms(workflow.name);
  const safeMatches: ReusablePageObject[] = [];
  for (const pageObject of candidates.filter((candidate) => candidate.filePath.startsWith('pages/') && candidate.className)) {
    const noArgumentMethods = pageObject.methodDetails.filter((method) => method.parameterCount === 0);
    const businessMethod = noArgumentMethods.find((method) =>
      !/^(verify|assert|expect)/i.test(method.name) && hasSharedTerm(workflowTerms, terms(method.name))
    ) ?? noArgumentMethods.find((method) => method.name === 'performWorkflow');
    const verificationMethod = noArgumentMethods.find((method) => /^(verify|assert|expect)/i.test(method.name));
    const pageMatchesWorkflow = hasSharedTerm(workflowTerms, terms(pageObject.name));
    if (!businessMethod || !verificationMethod || !pageMatchesWorkflow) continue;
    safeMatches.push({
      pageObject,
      businessMethod: businessMethod.name,
      verificationMethod: verificationMethod.name,
      reason: `Reuses ${pageObject.className}.${businessMethod.name}() and ${verificationMethod.name}() from ${pageObject.filePath}.`
    });
  }
  if (!preferredAsset) return safeMatches[0];
  const normalizedPreference = preferredAsset.toLowerCase();
  return safeMatches.find((match) =>
    [match.pageObject.filePath, match.pageObject.name, match.pageObject.className ?? ''].some((value) => value.toLowerCase() === normalizedPreference)
  ) ?? safeMatches[0];
}

function terms(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
}

function hasSharedTerm(left: string[], right: string[]): boolean {
  return left.some((term) => right.includes(term));
}
