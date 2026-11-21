<?php

namespace App\Http\Controllers;

use App\Models\League;
use App\Models\Season;
use App\Models\SeasonTeam;
use App\Models\Snapshot;
use App\Services\Site\LeagueOdds;
use App\Support\Format;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/** The public odds pages (features/10). Everything comes from the current snapshot in local tables. */
class OddsController extends Controller
{
    public function __construct(private readonly LeagueOdds $odds) {}

    public function home(): InertiaResponse
    {
        $leagues = League::orderBy('code')->get()->map(function (League $league): array {
            $context = $this->context($league);
            $movers = $context === null ? [] : collect($this->odds->rows($context['season'], $context['snapshot']))
                ->filter(fn (array $r): bool => $r['change_1d'] !== null)
                ->sortByDesc(fn (array $r): float => abs($r['change_1d']))
                ->take(5)
                ->map(fn (array $r): array => $this->publicRow($r))
                ->values();

            return ['code' => $league->code, 'name' => $league->name, 'meta' => $context['meta'] ?? null, 'movers' => $movers];
        });

        return Inertia::render('Home', ['leagues' => $leagues]);
    }

    public function league(League $league): InertiaResponse
    {
        $context = $this->context($league);
        $rows = collect($context ? $this->odds->rows($context['season'], $context['snapshot']) : []);

        return Inertia::render('League/Index', [
            'league' => ['code' => $league->code, 'name' => $league->name],
            'meta' => $context['meta'] ?? null,
            'conferences' => $this->grouped($rows),
        ]);
    }

    public function seeds(League $league): InertiaResponse
    {
        $context = $this->context($league);
        $rows = collect($context ? $this->odds->rows($context['season'], $context['snapshot']) : []);

        return Inertia::render('League/Seeds', [
            'league' => ['code' => $league->code, 'name' => $league->name],
            'meta' => $context['meta'] ?? null,
            'conferences' => $rows->groupBy('conference')->map(fn (Collection $teams, int|string $conference): array => [
                'name' => (string) $conference,
                'teams' => $teams->sortByDesc('p_playoffs')->map(fn (array $r): array => $this->publicRow($r) + [
                    'p_seed' => $r['odds']->p_seed,
                    'p_miss' => 1 - $r['p_playoffs'],
                ])->values(),
            ])->values(),
        ]);
    }

    public function team(League $league, string $team): InertiaResponse
    {
        $context = $this->context($league) ?? abort(404);
        $row = collect($this->odds->rows($context['season'], $context['snapshot']))->firstWhere('slug', $team) ?? abort(404);
        $seasonTeam = SeasonTeam::query()->whereKey((int) $row['id'])->firstOrFail();
        $o = $row['odds'];

        return Inertia::render('League/Team', [
            'league' => ['code' => $league->code, 'name' => $league->name],
            'meta' => $context['meta'],
            'team' => $this->publicRow($row) + [
                'p_round' => $o->p_round,
                'p_seed' => $o->p_seed,
                'wins_hist' => $o->wins_hist,
                'wins_p50' => $o->wins_p50,
            ],
            'answer' => $this->answer($row, $context['meta']['as_of']),
            'history' => $this->odds->history($context['season'], $seasonTeam),
            'games' => $this->odds->games($context['season'], $seasonTeam),
        ]);
    }

    public function methodology(): InertiaResponse
    {
        $current = League::orderBy('code')->get()->map(function (League $league): ?array {
            $context = $this->context($league);
            if ($context === null) {
                return null;
            }
            $s = $context['snapshot'];

            return [
                'league' => $league->name,
                'season' => $context['season']->year,
                'as_of' => $context['meta']['as_of'],
                'sims' => $s->sims,
                'engine_version' => $s->engine_version,
                'standings_version' => $s->standings_version,
                'rules_id' => $s->rules_id,
                'clinch_method' => $s->diagnostics['clinch']['method'] ?? null,
                'origin' => $s->origin,
            ];
        })->filter()->values();

        return Inertia::render('Methodology', ['current' => $current]);
    }

    public function sitemap(): Response
    {
        $urls = [route('home'), route('methodology')];
        foreach (League::orderBy('code')->get() as $league) {
            $urls[] = route('league', $league->code);
            $urls[] = route('league.seeds', $league->code);
            $season = $this->odds->season($league);
            foreach ($season?->seasonTeams()->with('team')->get() ?? [] as $st) {
                $urls[] = route('team', [$league->code, $st->team->slug]);
            }
        }
        $body = '<?xml version="1.0" encoding="UTF-8"?>'."\n".'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n"
            .implode("\n", array_map(fn (string $u): string => '  <url><loc>'.e($u).'</loc></url>', $urls))."\n</urlset>\n";

        return response($body, 200, ['Content-Type' => 'application/xml']);
    }

    /**
     * The league's season, current snapshot and the shared page meta, or null before the first run.
     *
     * @return array{season: Season, snapshot: Snapshot, meta: array<string, mixed>}|null
     */
    private function context(League $league): ?array
    {
        $season = $this->odds->season($league);
        $snapshot = $season ? $this->odds->current($season) : null;
        if ($season === null || $snapshot === null) {
            return null;
        }

        return [
            'season' => $season,
            'snapshot' => $snapshot,
            'meta' => [
                'season' => $season->year,
                'as_of' => LeagueOdds::formatAsOf($snapshot->as_of, $league->timezone),
                'as_of_iso' => $snapshot->as_of->toIso8601ZuluString(),
                'stale' => $this->odds->isStale($season, $snapshot),
                'origin' => $snapshot->origin,
                'sims' => $snapshot->sims,
            ],
        ];
    }

    /**
     * Rows grouped by conference, then division, in standings order.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function grouped(Collection $rows): array
    {
        $conferences = [];
        foreach ($rows as $r) {
            $conferences[$r['conference']][$r['division']][] = $this->publicRow($r);
        }
        $out = [];
        foreach ($conferences as $name => $divisions) {
            $out[] = [
                'name' => $name,
                'divisions' => array_map(fn (string $division, array $teams): array => ['name' => $division, 'teams' => $teams], array_keys($divisions), array_values($divisions)),
            ];
        }

        return $out;
    }

    /**
     * A row without the model, as sent to the page.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function publicRow(array $row): array
    {
        unset($row['odds']);

        return $row;
    }

    /**
     * The answer sentence (05 §1), from probabilities and clinch statuses only.
     *
     * @param  array<string, mixed>  $row
     */
    private function answer(array $row, string $asOf): string
    {
        $name = "The {$row['short_name']}";
        $status = $row['clinch']['playoffs']['status'] ?? 'alive';
        if ($status === 'eliminated') {
            return "{$name} have been eliminated from playoff contention (as of {$asOf}).";
        }
        $tail = 'including '.Format::pct($row['p_division']).' to win the '.$row['division'].' and '.Format::pct($row['p_champion']).' to win the Super Bowl.';
        if ($status === 'clinched') {
            return "{$name} have clinched a playoff spot (as of {$asOf}), with ".Format::pct($row['p_division']).' to win the '.$row['division'].' and '.Format::pct($row['p_champion']).' to win the Super Bowl.';
        }

        return "{$name} have a ".Format::pct($row['p_playoffs'])." chance to make the playoffs (as of {$asOf}), {$tail}";
    }
}
