import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { repositoryRoot } from '../config.js';

type RecordingStatus = 'starting' | 'running' | 'stopped' | 'exited' | 'failed';

interface RecordingSession {
  id: string;
  url: string;
  status: RecordingStatus;
  createdAt: string;
  updatedAt: string;
  outputPath: string;
  draftPath: string;
  process?: ChildProcess;
  exitCode?: number | null;
  error?: string;
}

const sessions = new Map<string, RecordingSession>();
const sessionRoot = path.join(repositoryRoot, 'storage/codegen-sessions');
const maxSourceLength = 2 * 1024 * 1024;

export const recordingRouter = Router();

recordingRouter.post('/sessions', async (req, res, next) => {
  try {
    const url = validateUrl(req.body?.url);
    const active = [...sessions.values()].find((session) => session.status === 'starting' || session.status === 'running');
    if (active) {
      return res.status(409).json({ message: 'A Codegen recording session is already running.', session: await snapshot(active) });
    }

    const id = randomUUID();
    const directory = path.join(sessionRoot, id);
    const outputPath = path.join(directory, 'recorded.spec.ts');
    const draftPath = path.join(directory, 'edited.spec.ts');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(outputPath, '');

    const session: RecordingSession = {
      id,
      url: url.toString(),
      status: 'starting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputPath,
      draftPath
    };
    sessions.set(id, session);

    const child = spawn('npx', ['playwright', 'codegen', '--target=playwright-test', `--output=${outputPath}`, session.url], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'ignore',
      windowsHide: false
    });
    session.process = child;
    session.status = 'running';
    session.updatedAt = new Date().toISOString();
    child.once('error', (error) => updateSession(session, 'failed', error.message));
    child.once('exit', (code) => {
      if (session.status === 'running' || session.status === 'starting') {
        session.status = 'exited';
        session.exitCode = code;
        session.updatedAt = new Date().toISOString();
      }
    });

    res.status(201).json(await snapshot(session));
  } catch (error) {
    next(error);
  }
});

recordingRouter.get('/sessions/:id', async (req, res, next) => {
  try {
    const session = requireSession(req.params.id);
    res.json(await snapshot(session));
  } catch (error) {
    next(error);
  }
});

recordingRouter.post('/sessions/:id/stop', async (req, res, next) => {
  try {
    const session = requireSession(req.params.id);
    if (session.status === 'running' || session.status === 'starting') session.process?.kill('SIGTERM');
    session.status = 'stopped';
    session.updatedAt = new Date().toISOString();
    res.json(await snapshot(session));
  } catch (error) {
    next(error);
  }
});

recordingRouter.post('/sessions/:id/save', async (req, res, next) => {
  try {
    const session = requireSession(req.params.id);
    const source = requireSource(req.body?.source);
    await fs.writeFile(session.draftPath, source, 'utf8');
    session.updatedAt = new Date().toISOString();
    res.json(await snapshot(session));
  } catch (error) {
    next(error);
  }
});

recordingRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unable to manage the recording session.';
  res.status(400).json({ message });
});

function requireSession(id: string): RecordingSession {
  const session = sessions.get(id);
  if (!session) throw new Error('Recording session was not found. Start a new session after restarting the API.');
  return session;
}

function validateUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A URL is required to start recording.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid absolute URL, such as https://example.com.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs can be recorded.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not supported.');
  return url;
}

function requireSource(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Recording source must be text.');
  if (value.length > maxSourceLength) throw new Error('Recording source exceeds the 2 MB limit.');
  return value;
}

function updateSession(session: RecordingSession, status: RecordingStatus, error: string): void {
  session.status = status;
  session.error = error;
  session.updatedAt = new Date().toISOString();
}

async function snapshot(session: RecordingSession) {
  const [generatedSource, editedSource] = await Promise.all([readIfPresent(session.outputPath), readIfPresent(session.draftPath)]);
  return {
    id: session.id,
    url: session.url,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    exitCode: session.exitCode,
    error: session.error,
    generatedSource,
    editedSource
  };
}

async function readIfPresent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
