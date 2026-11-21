<?php

/*
| The snapshot pipeline (02 §3): how runs are sized, where inputs are kept and how the engine's
| command-line tools are called.
*/

return [
    // Simulations per run.
    'sims' => (int) env('SNAPSHOT_SIMS', 100000),

    // Disk for the gzipped inputs (the server's local disk; storage/app/private).
    'disk' => env('SNAPSHOT_DISK', 'local'),

    // A run is skipped when results, schedule and engine are unchanged and no game or matchup
    // probability moved by more than this since the last published snapshot. SportsCrunch's
    // projections drift by about 0.0001 a minute on their own.
    'skip_tolerance' => (float) env('SNAPSHOT_SKIP_TOLERANCE', 0.002),

    // A live run's as_of trails the clock by this many seconds; SportsCrunch rejects future instants.
    'live_lag_seconds' => 60,

    // Runs after games go final (02 §3 step 1). `game` runs after every final; `window` waits until
    // no game is in progress, so a slate of games gives one run. Triggers within `debounce_seconds`
    // of each other share a run.
    'after_finals' => [
        'mode' => env('SNAPSHOT_AFTER_FINALS', 'game'),
        'debounce_seconds' => (int) env('SNAPSHOT_DEBOUNCE_SECONDS', 90),
    ],

    // The polling fallback for SportsCrunch's webhooks: while a game is in progress (kicked off in
    // the last `in_progress_hours` and not final), re-sync the season every `every_minutes`.
    'poll' => [
        'enabled' => (bool) env('SNAPSHOT_POLL', true),
        'every_minutes' => (int) env('SNAPSHOT_POLL_MINUTES', 10),
        'in_progress_hours' => 8,
    ],

    'engine' => [
        'node' => env('NODE_BINARY', 'node'),
        'simulate' => base_path('packages/cli/dist/simulate.mjs'),
        'standings' => base_path('packages/cli/dist/standings.mjs'),
        'timeout' => (int) env('SNAPSHOT_ENGINE_TIMEOUT', 300),
    ],
];
