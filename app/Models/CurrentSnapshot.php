<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * The snapshot the site shows for a season (02 §2). Moved only by a publish.
 *
 * @property int $season_id
 * @property string $snapshot_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Table(key: 'season_id', incrementing: false)]
#[Fillable(['season_id', 'snapshot_id'])]
class CurrentSnapshot extends Model
{
    /** @return BelongsTo<Snapshot, $this> */
    public function snapshot(): BelongsTo
    {
        return $this->belongsTo(Snapshot::class);
    }
}
