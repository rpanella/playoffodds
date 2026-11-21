<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Clinched, eliminated or alive for one team and target in a snapshot, from the standings engine's
 * conservative check (features/14). Never inferred from a probability.
 *
 * @property int $id
 * @property string $snapshot_id
 * @property int $season_team_id
 * @property string $target playoffs, division or top_seed.
 * @property string $status clinched, eliminated or alive.
 * @property bool $controls_destiny
 * @property bool $timed_out
 * @property string $method_version
 * @property array<string, mixed>|null $details
 */
#[Table(timestamps: false)]
#[Fillable(['snapshot_id', 'season_team_id', 'target', 'status', 'controls_destiny', 'timed_out', 'method_version', 'details'])]
class ClinchStatus extends Model
{
    /** @return BelongsTo<SeasonTeam, $this> */
    public function seasonTeam(): BelongsTo
    {
        return $this->belongsTo(SeasonTeam::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'controls_destiny' => 'boolean',
            'timed_out' => 'boolean',
            'details' => 'array',
        ];
    }
}
