import fs from 'node:fs';
import path from 'node:path';
import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai';

type CredentialMap = Record<string, Credential>;

export class FileCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {}

  private readAll(): CredentialMap {
    if (!fs.existsSync(this.filePath)) return {};
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as CredentialMap;
  }

  private writeAll(credentials: CredentialMap): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(credentials, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tempPath, this.filePath);
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.readAll()[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.readAll()).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    let result: Credential | undefined;
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const credentials = this.readAll();
      result = await fn(credentials[providerId]);
      if (result) {
        credentials[providerId] = result;
        this.writeAll(credentials);
      }
    });
    this.chains.set(providerId, next.catch(() => undefined));
    await next;
    return result;
  }

  async delete(providerId: string): Promise<void> {
    await this.modify(providerId, async () => {
      const credentials = this.readAll();
      delete credentials[providerId];
      this.writeAll(credentials);
      return undefined;
    });
  }
}
