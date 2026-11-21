import { InputError } from '@playoffodds/standings';

export async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch (e) {
    throw new InputError(`stdin is not valid JSON: ${(e as Error).message}`);
  }
}

/** Run a command: JSON result on stdout; on failure a JSON error on stderr, exit 2 for bad input, 1 otherwise. */
export async function run(main: () => Promise<unknown>): Promise<void> {
  try {
    process.stdout.write(JSON.stringify(await main()) + '\n');
  } catch (e) {
    const input = e instanceof InputError;
    process.stderr.write(JSON.stringify({ error: input ? 'invalid_input' : 'internal_error', message: (e as Error).message }) + '\n');
    process.exitCode = input ? 2 : 1;
  }
}
