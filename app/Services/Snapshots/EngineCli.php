<?php

namespace App\Services\Snapshots;

use Illuminate\Support\Facades\Process;

/**
 * Runs the engine's bundled command-line tools (02 §3 step 6): JSON in on stdin, JSON out on stdout,
 * and on failure a JSON error on stderr (exit 2 for bad input, 1 otherwise).
 */
class EngineCli
{
    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function simulate(array $input): array
    {
        return $this->run('simulate', [config()->string('snapshots.engine.simulate')], $input);
    }

    /**
     * Standings and seeds if the season ended at the input's `as_of`.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function standings(array $input): array
    {
        return $this->run('standings', [config()->string('snapshots.engine.standings'), 'standings'], $input);
    }

    /** A hash of both bundles, so any change to the engine or the standings package changes it. */
    public function build(): string
    {
        $hashes = '';
        foreach (['simulate', 'standings'] as $tool) {
            $path = config()->string("snapshots.engine.{$tool}");
            if (! is_file($path)) {
                throw new SnapshotException("The engine's {$tool} tool isn't built ({$path}); run npm run build:cli");
            }
            $hashes .= hash_file('sha256', $path);
        }

        return hash('sha256', $hashes);
    }

    /**
     * @param  list<string>  $args
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function run(string $tool, array $args, array $input): array
    {
        $result = Process::timeout(config()->integer('snapshots.engine.timeout'))
            ->input(InputBuilder::json($input))
            ->run([config()->string('snapshots.engine.node'), ...$args]);

        if ($result->failed()) {
            $error = json_decode($result->errorOutput(), true);
            $message = is_array($error) && is_string($error['message'] ?? null) ? $error['message'] : trim($result->errorOutput());
            throw new SnapshotException("Engine {$tool} failed (exit {$result->exitCode()}): {$message}");
        }
        $output = json_decode($result->output(), true);
        if (! is_array($output)) {
            throw new SnapshotException("Engine {$tool} printed no JSON result");
        }

        return $output;
    }
}
