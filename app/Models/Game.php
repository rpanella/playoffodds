<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A game copied from SportsCrunch. `p_home`, `p_source` and `odds_snapshot_id` belong to the current
 * snapshot and are written only when one is published (02 §2); the SportsCrunch sync leaves them alone.
 *
 * @property int $id
 * @property int $season_id
 * @property int $sc_game_id
 * @property int $home_season_team_id
 * @property int $away_season_team_id
 * @property Carbon $start_at
 * @property int|null $week
 * @property string $season_type
 * @property bool $neutral
 * @property string $status SportsCrunch's status as sent.
 * @property int|null $home_score
 * @property int|null $away_score
 * @property string|null $end_type
 * @property float|null $p_home
 * @property string|null $p_source
 * @property string|null $odds_snapshot_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable([
    'season_id', 'sc_game_id', 'home_season_team_id', 'away_season_team_id', 'start_at', 'week', 'season_type',
    'neutral', 'status', 'home_score', 'away_score', 'end_type', 'p_home', 'p_source', 'odds_snapshot_id',
])]
class Game extends Model
{
    /** @return BelongsTo<Season, $this> */
    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class);
    }

    /** @return BelongsTo<SeasonTeam, $this> */
    public function homeTeam(): BelongsTo
    {
        return $this->belongsTo(SeasonTeam::class, 'home_season_team_id');
    }

    /** @return BelongsTo<SeasonTeam, $this> */
    public function awayTeam(): BelongsTo
    {
        return $this->belongsTo(SeasonTeam::class, 'away_season_team_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'start_at' => 'datetime',
            'neutral' => 'boolean',
            'p_home' => 'float',
        ];
    }
}
