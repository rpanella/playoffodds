<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A team's place in one season's alignment.
 *
 * @property int $id
 * @property int $season_id
 * @property int $team_id
 * @property string $conference Short code, e.g. "AFC".
 * @property string $division Full name, e.g. "AFC East".
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['season_id', 'team_id', 'conference', 'division'])]
class SeasonTeam extends Model
{
    /** @return BelongsTo<Season, $this> */
    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class);
    }

    /** @return BelongsTo<Team, $this> */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
