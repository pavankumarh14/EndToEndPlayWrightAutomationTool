import { FrameworkIndex, PageObjectModel, TestModel, WorkflowModel } from '../types/domain.js';
import { SimilarityEngine } from '../similarity/similarityEngine.js';

export interface RetrievalContext {
  workflows: WorkflowModel[];
  pageObjects: PageObjectModel[];
  tests: TestModel[];
  tokenEstimate: number;
  evidence: string[];
}

export class RetrievalEngine {
  private readonly similarity = new SimilarityEngine();

  retrieve(workflow: WorkflowModel, index: FrameworkIndex, limit = 5): RetrievalContext {
    const workflows = this.similarity
      .rank(workflow.intent, index.workflows, (candidate) => `${candidate.name} ${candidate.intent}`)
      .slice(0, limit);
    const pageObjects = this.similarity
      .rank(workflow.intent, index.pageObjects, (candidate) => `${candidate.name} ${candidate.methods.join(' ')}`)
      .slice(0, limit);
    const tests = this.similarity
      .rank(workflow.intent, index.tests, (candidate) => `${candidate.name} ${candidate.workflows.join(' ')}`)
      .slice(0, limit);

    const payload = JSON.stringify({ workflows, pageObjects, tests });
    return {
      workflows: workflows.map((result) => result.asset),
      pageObjects: pageObjects.map((result) => result.asset),
      tests: tests.map((result) => result.asset),
      tokenEstimate: Math.ceil(payload.length / 4),
      evidence: [
        ...workflows.flatMap((result) => result.evidence),
        ...pageObjects.flatMap((result) => result.evidence),
        ...tests.flatMap((result) => result.evidence)
      ]
    };
  }
}
