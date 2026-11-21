<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One simulation run for a league-season at `as_of`. Immutable once published (02 §1, §3).
 *
 * @property string $id ULID; also the simulation seed.
 * @property int $league_id
 * @property int $season_id
 * @property Carbon $as_of
 * @property string $trigger scheduled, game_final, backfill or manual.
 * @property string $origin live or reconstructed.
 * @property string $status running, published or failed.
 * @property string|null $input_path
 * @property string|null $input_sha256
 * @property string|null $content_sha256
 * @property string|null $engine_build
 * @property string $seed
 * @property int $sims
 * @property string|null $engine_version
 * @property string|null $standings_version
 * @property string|null $rules_id
 * @property int|null $runtime_ms
 * @property array<string, mixed>|null $diagnostics
 * @property string|null $error
 * @property string|null $superseded_by_id
 * @property Carbon|null $published_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable([
    'id', 'league_id', 'season_id', 'as_of', 'trigger', 'origin', 'status', 'input_path', 'input_sha256', 'content_sha256',
    'engine_build', 'seed', 'sims', 'engine_version', 'standings_version', 'rules_id', 'runtime_ms', 'diagnostics', 'error',
    'superseded_by_id', 'published_at',
])]
class Snapshot extends Model
{
    use HasUlids;

    public const STATUS_RUNNING = 'running';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_FAILED = 'failed';

    /** @return BelongsTo<League, $this> */
    public function league(): BelongsTo
    {
        return $this->belongsTo(League::class);
    }

    /** @return BelongsTo<Season, $this> */
    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class);
    }

    /** @return HasMany<TeamOdds, $this> */
    public function teamOdds(): HasMany
    {
        return $this->hasMany(TeamOdds::class);
    }

    /** @return HasMany<SnapshotStanding, $this> */
    public function standings(): HasMany
    {
        return $this->hasMany(SnapshotStanding::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'as_of' => 'datetime',
            'diagnostics' => 'array',
            'published_at' => 'datetime',
        ];
    }
}
