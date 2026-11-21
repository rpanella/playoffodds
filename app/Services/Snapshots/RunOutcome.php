<?php

namespace App\Services\Snapshots;

use App\Models\Snapshot;

final readonly class RunOutcome
{
    /**
     * @param  Snapshot|null  $snapshot  The published snapshot; null when skipped.
     * @param  Snapshot|null  $previous  For a skip, the published snapshot it matched.
     */
    public function __construct(
        public ?Snapshot $snapshot,
        public bool $current,
        public ?Snapshot $previous = null,
    ) {}

    public function skipped(): bool
    {
        return $this->snapshot === null;
    }
}
