<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $league_id
 * @property int $year
 * @property int $sc_season_id
 * @property string $status
 * @property Carbon|null $regular_season_start_date
 * @property Carbon|null $regular_season_end_date
 * @property Carbon|null $post_season_start_date
 * @property Carbon|null $post_season_end_date
 * @property Carbon|null $synced_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable([
    'league_id', 'year', 'sc_season_id', 'status',
    'regular_season_start_date', 'regular_season_end_date', 'post_season_start_date', 'post_season_end_date',
    'synced_at',
])]
class Season extends Model
{
    /** @return BelongsTo<League, $this> */
    public function league(): BelongsTo
    {
        return $this->belongsTo(League::class);
    }

    /** @return HasMany<SeasonTeam, $this> */
    public function seasonTeams(): HasMany
    {
        return $this->hasMany(SeasonTeam::class);
    }

    /** @return HasMany<Game, $this> */
    public function games(): HasMany
    {
        return $this->hasMany(Game::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'regular_season_start_date' => 'date',
            'regular_season_end_date' => 'date',
            'post_season_start_date' => 'date',
            'post_season_end_date' => 'date',
            'synced_at' => 'datetime',
        ];
    }
}
