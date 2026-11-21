<?php

/*
| The snapshot pipeline (02 §3): how runs are sized, where inputs are kept and how the engine's
| command-line tools are called.
*/

return [
    // Simulations per run.
    'sims' => (int) env('SNAPSHOT_SIMS', 100000),

    // Disk for the gzipped inputs (S3 in production).
    'disk' => env('SNAPSHOT_DISK', 'local'),

    // A run is skipped when results, schedule and engine are unchanged and no game or matchup
    // probability moved by more than this since the last published snapshot. SportsCrunch's
    // projections drift by about 0.0001 a minute on their own.
    'skip_tolerance' => (float) env('SNAPSHOT_SKIP_TOLERANCE', 0.002),

    // A live run's as_of trails the clock by this many seconds; SportsCrunch rejects future instants.
    'live_lag_seconds' => 60,

    'engine' => [
        'node' => env('NODE_BINARY', 'node'),
        'simulate' => base_path('packages/cli/dist/simulate.mjs'),
        'standings' => base_path('packages/cli/dist/standings.mjs'),
        'timeout' => (int) env('SNAPSHOT_ENGINE_TIMEOUT', 300),
    ],
];
