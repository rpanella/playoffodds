// SportsCrunch API client for the analysis scripts. Needs SPORTSCRUNCH_API_KEY (and optionally
// SPORTSCRUNCH_API_URL) from the environment or an env file (.env, or --env-file=path). The env
// file is parsed by Node, never by a shell: the token contains `|`.
import { existsSync } from 'node:fs';

export const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const envFile = arg('env-file', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export async function get<T>(path: string): Promise<T> {
  const base = (process.env.SPORTSCRUNCH_API_URL ?? 'https://sportscrunch.com').replace(/\/$/, '') + '/api/v1';
  const token = process.env.SPORTSCRUNCH_API_KEY;
  if (!token) throw new Error('SPORTSCRUNCH_API_KEY is not set');
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { data: T }).data;
}

export interface ScSeason { id: number; year: number }
export interface ScTeam { id: number; shortname: string; location: string; name: string; division: string }
export interface ScGame {
  id: number; start_time: string; status: string; season_type: string; week: number | null;
  home_team: { id: number }; away_team: { id: number }; neutral_location: boolean | null;
  home_score: number | null; away_score: number | null; home_win_probability: number | null;
}
export interface ScOdds { id: number; home_win_probability: number | null; is_projected: boolean }

/** An instant formatted the way `historical-odds?at=` accepts it. */
export const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');
