<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A team's simulated odds in one snapshot (01 §6).
 *
 * @property int $id
 * @property string $snapshot_id
 * @property int $season_team_id
 * @property float $p_playoffs
 * @property float $p_division
 * @property float $p_top_seed
 * @property float $p_champion
 * @property list<float> $p_seed Seed 1 first.
 * @property array<string, float> $p_round Reached each round, keyed by round name, plus champion.
 * @property float $wins_mean
 * @property int $wins_p10
 * @property int $wins_p50
 * @property int $wins_p90
 * @property array<string, float> $wins_hist
 */
#[Table(name: 'team_odds', timestamps: false)]
#[Fillable([
    'snapshot_id', 'season_team_id', 'p_playoffs', 'p_division', 'p_top_seed', 'p_champion', 'p_seed', 'p_round',
    'wins_mean', 'wins_p10', 'wins_p50', 'wins_p90', 'wins_hist',
])]
class TeamOdds extends Model
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
            'p_playoffs' => 'float',
            'p_division' => 'float',
            'p_top_seed' => 'float',
            'p_champion' => 'float',
            'p_seed' => 'array',
            'p_round' => 'array',
            'wins_mean' => 'float',
            'wins_hist' => 'array',
        ];
    }
}
