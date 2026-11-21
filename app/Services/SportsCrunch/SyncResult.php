<?php

namespace App\Services\SportsCrunch;

use App\Models\Season;

final readonly class SyncResult
{
    public function __construct(
        public Season $season,
        public int $teams,
        public int $games,
        public int $added,
        public int $removed,
    ) {}
}
