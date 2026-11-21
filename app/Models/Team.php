<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A franchise in a league, across seasons. Its conference and division are per season (SeasonTeam).
 *
 * @property int $id
 * @property int $league_id
 * @property int $sc_team_id
 * @property string $slug Page URL segment, e.g. "buffalo-bills".
 * @property string $name Full name, e.g. "Buffalo Bills".
 * @property string $location
 * @property string $short_name e.g. "Bills".
 * @property string $abbreviation e.g. "BUF".
 * @property string|null $primary_color
 * @property string|null $secondary_color
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['league_id', 'sc_team_id', 'slug', 'name', 'location', 'short_name', 'abbreviation', 'primary_color', 'secondary_color'])]
class Team extends Model
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
}
