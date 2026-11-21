<?php

namespace App\Console\Commands;

use App\Models\CurrentSnapshot;
use App\Models\Snapshot;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

#[Signature('snapshot:list
    {league=nfl : League code}
    {year? : Season year (default: every season)}
    {--limit=20 : Rows to show, newest as_of first}
    {--failed : Only failed runs}')]
#[Description('List recent snapshots with their status, diagnostics and errors')]
class ListSnapshots extends Command
{
    public function handle(): int
    {
        $league = (string) $this->argument('league');
        $year = $this->argument('year');
        $snapshots = Snapshot::query()
            ->with('season', 'league')
            ->whereRelation('league', 'code', $league)
            ->when($year !== null, fn ($q) => $q->whereRelation('season', 'year', (int) $year))
            ->when($this->option('failed'), fn ($q) => $q->where('status', Snapshot::STATUS_FAILED))
            ->orderByDesc('as_of')
            ->orderByDesc('created_at')
            ->limit((int) $this->option('limit'))
            ->get();
        $current = CurrentSnapshot::pluck('snapshot_id')->flip();

        $this->table(
            ['Snapshot', 'Season', 'As of (league time)', 'Origin', 'Trigger', 'Status', 'Sims', 'ms', 'Draws', 'Clipped', 'Error'],
            $snapshots->map(fn (Snapshot $s): array => [
                $s->id.($current->has($s->id) ? ' *' : ''),
                $s->season->year,
                $s->as_of->setTimezone($s->league->timezone)->format('Y-m-d H:i T'),
                $s->origin,
                $s->trigger,
                $s->status,
                $s->sims,
                $s->runtime_ms,
                $s->diagnostics['tiebreak_draws']['count'] ?? '',
                $s->diagnostics['drift_clipped'] ?? '',
                Str::limit((string) $s->error, 70),
            ]),
        );
        $this->line('  * current');

        return self::SUCCESS;
    }
}
