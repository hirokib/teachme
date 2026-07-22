import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { createModels, type AuthEvent, type AuthPrompt, type Message } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { FileCredentialStore } from './credential-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTH_PATH = process.env.CODEX_AUTH_PATH || path.join(here, '..', 'auth.json');
const credentials = new FileCredentialStore(AUTH_PATH);
const models = createModels({ credentials });
models.setProvider(openaiCodexProvider());

type LoginState = {
  status: 'disconnected' | 'waiting' | 'connected' | 'error';
  verificationUri?: string;
  userCode?: string;
  error?: string;
};

let loginState: LoginState = { status: 'disconnected' };
let loginPromise: Promise<void> | null = null;

function notifyLogin(event: AuthEvent): void {
  if (event.type === 'device_code') {
    loginState = {
      status: 'waiting',
      verificationUri: event.verificationUri,
      userCode: event.userCode,
    };
  }
}

async function promptLogin(prompt: AuthPrompt): Promise<string> {
  if (prompt.type === 'select') return 'device_code';
  throw new Error(`Unsupported Codex login prompt: ${prompt.type}`);
}

async function hasCredential(): Promise<boolean> {
  return Boolean(await credentials.read('openai-codex'));
}

export async function getCodexAuthStatus(_req: Request, res: Response): Promise<void> {
  if (await hasCredential()) loginState = { status: 'connected' };
  res.json(loginState);
}

export async function startCodexLogin(_req: Request, res: Response): Promise<void> {
  if (await hasCredential()) {
    loginState = { status: 'connected' };
    res.json(loginState);
    return;
  }

  if (!loginPromise) {
    loginState = { status: 'waiting' };
    loginPromise = models
      .login('openai-codex', 'oauth', { prompt: promptLogin, notify: notifyLogin })
      .then(() => {
        loginState = { status: 'connected' };
      })
      .catch((error: unknown) => {
        loginState = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
      })
      .finally(() => {
        loginPromise = null;
      });
  }

  for (let attempt = 0; attempt < 50 && !loginState.userCode; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  res.json(loginState);
}

export async function logoutCodex(_req: Request, res: Response): Promise<void> {
  await models.logout('openai-codex');
  loginState = { status: 'disconnected' };
  res.status(204).send();
}

type BrowserChatMessage = { role: 'user' | 'assistant'; text: string };

function toPiMessages(messages: BrowserChatMessage[]): Message[] {
  return messages.map((message) =>
    message.role === 'user'
      ? { role: 'user', content: message.text, timestamp: Date.now() }
      : {
          role: 'assistant',
          content: [{ type: 'text', text: message.text }],
          api: 'openai-codex-responses',
          provider: 'openai-codex',
          model: process.env.OPENAI_CODEX_MODEL || 'gpt-5.4',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
        }
  );
}

export async function codexChat(req: Request, res: Response): Promise<void> {
  const { messages } = req.body as { messages?: BrowserChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages must be a non-empty array' });
    return;
  }
  if (!(await hasCredential())) {
    res.status(401).json({ error: 'Sign in with ChatGPT first' });
    return;
  }

  const modelId = process.env.OPENAI_CODEX_MODEL || 'gpt-5.4';
  const model = models.getModel('openai-codex', modelId);
  if (!model) {
    res.status(500).json({ error: `Unknown Codex model: ${modelId}` });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  try {
    const stream = models.streamSimple(model, { messages: toPiMessages(messages) }, {
      signal: abort.signal,
      sessionId: req.header('x-session-id') || undefined,
      transport: 'auto',
    });
    for await (const event of stream) {
      if (event.type === 'text_delta') res.write(event.delta);
      if (event.type === 'error') throw new Error(event.error.errorMessage || 'Codex request failed');
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    } else {
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
