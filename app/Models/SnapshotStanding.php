<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A team's standing if the season ended at the snapshot's `as_of`, from the standings engine.
 *
 * @property int $id
 * @property string $snapshot_id
 * @property int $season_team_id
 * @property int $wins
 * @property int $losses
 * @property int $ties
 * @property float $win_pct
 * @property int $division_rank
 * @property int $conference_rank
 * @property int|null $seed
 * @property array<string, mixed> $extras
 */
#[Table(timestamps: false)]
#[Fillable(['snapshot_id', 'season_team_id', 'wins', 'losses', 'ties', 'win_pct', 'division_rank', 'conference_rank', 'seed', 'extras'])]
class SnapshotStanding extends Model
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
            'win_pct' => 'float',
            'extras' => 'array',
        ];
    }
}
