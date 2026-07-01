import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class GitService {
  constructor(private readonly cwd: string) {}

  async diff(): Promise<string> {
    return this.run(['diff', '--']);
  }

  async status(): Promise<string> {
    return this.run(['status', '--short']);
  }

  async commit(message: string): Promise<string> {
    await this.run(['add', '.']);
    return this.run(['commit', '-m', message]);
  }

  private async run(args: string[]): Promise<string> {
    const { stdout, stderr } = await exec('git', args, { cwd: this.cwd });
    return stdout || stderr;
  }
}
