<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { computed } from 'vue';
import HistoryChart from '@/components/HistoryChart.vue';
import SiteLayout from '@/layouts/SiteLayout.vue';
import { change, clinchLabel, pct, record } from '@/lib/format';
import type { League, Meta, TeamRow } from '@/types/odds';

interface Opponent {
    name: string;
    abbreviation: string;
    slug: string;
}

const props = defineProps<{
    league: League;
    meta: Meta;
    team: TeamRow & {
        p_round: Record<string, number>;
        p_seed: number[];
        wins_hist: Record<string, number>;
        wins_p50: number;
    };
    answer: string;
    history: {
        date: string;
        origin: 'live' | 'reconstructed';
        p_playoffs: number;
        p_division: number;
        p_champion: number;
    }[];
    games: {
        results: {
            week: number | null;
            date: string;
            home: boolean;
            neutral: boolean;
            opponent: Opponent;
            result: 'W' | 'L' | 'T';
            score: string;
        }[];
        remaining: {
            week: number | null;
            date: string;
            home: boolean;
            neutral: boolean;
            opponent: Opponent;
            kickoff: string | null;
            p_win: number | null;
            p_source: string | null;
        }[];
    };
}>();

const title = computed(
    () => `${props.team.name} Playoff Odds ${props.meta.season}`,
);
const status = computed(() => clinchLabel(props.team.clinch));
const destiny = computed(
    () =>
        props.team.clinch.playoffs?.status === 'alive' &&
        props.team.clinch.playoffs.controls_destiny === true,
);
const rounds = computed(
    () =>
        [
            ['Make playoffs', props.team.p_playoffs],
            ['Win division', props.team.p_division],
            ['No. 1 seed (bye)', props.team.p_top_seed],
            ['Reach divisional round', props.team.p_round.divisional],
            ['Reach conference championship', props.team.p_round.conference],
            ['Reach Super Bowl', props.team.p_round.super_bowl],
            ['Win Super Bowl', props.team.p_champion],
        ] as [string, number | undefined][],
);
const wins = computed(() =>
    Object.entries(props.team.wins_hist)
        .map(([w, p]) => ({ w: Number(w), p }))
        .sort((a, b) => a.w - b.w),
);
const maxWinsP = computed(() =>
    Math.max(...wins.value.map((x) => x.p), 0.0001),
);
const where = (g: { home: boolean; neutral: boolean }) =>
    g.neutral ? 'vs (neutral)' : g.home ? 'vs' : '@';
</script>

<template>
    <Head :title="title">
        <meta name="description" :content="answer" />
    </Head>
    <SiteLayout :meta="meta">
        <p>
            <Link :href="`/${league.code}`" class="underline"
                >{{ league.name }} odds</Link
            >
            / {{ team.division }}
        </p>
        <h1 class="mb-1 text-xl font-bold">{{ title }}</h1>
        <p class="mb-1">
            {{ record(team.record)
            }}<span v-if="team.seed_now"
                >, seed {{ team.seed_now }} if the season ended today</span
            ><span v-else>, out of the playoffs if the season ended today</span
            >.
            <strong v-if="status">{{ status }}.</strong>
            <span v-if="destiny">
                Controls its own destiny: winning every remaining game clinches
                a playoff spot.</span
            >
        </p>
        <p class="mb-4">{{ answer }}</p>

        <h2 class="text-lg font-bold">Odds</h2>
        <table class="mb-1 border-collapse">
            <tbody>
                <tr v-for="[label, p] in rounds" :key="label">
                    <th class="border px-2 text-left font-normal">
                        {{ label }}
                    </th>
                    <td class="border px-2 text-right">{{ pct(p) }}</td>
                </tr>
            </tbody>
        </table>
        <p class="mb-4">
            Playoff odds since yesterday: {{ change(team.change_1d) }}; over 7
            days: {{ change(team.change_7d) }}.
        </p>

        <h2 class="text-lg font-bold">Playoff odds this season</h2>
        <HistoryChart
            :points="history"
            :results="games.results"
            :team-name="team.name"
            class="mb-4"
        />

        <h2 class="text-lg font-bold">Projected wins</h2>
        <p>
            Average {{ team.wins.mean.toFixed(1) }}, median {{ team.wins_p50 }},
            80% of simulations between {{ team.wins.p10 }} and
            {{ team.wins.p90 }}.
        </p>
        <table class="mb-4 border-collapse">
            <tbody>
                <tr v-for="x in wins" :key="x.w">
                    <th class="border px-2 text-right font-normal">
                        {{ x.w }} wins
                    </th>
                    <td class="border px-2 text-right">{{ pct(x.p) }}</td>
                    <td class="w-48 border px-1">
                        <div
                            class="h-3 bg-gray-500"
                            :style="`width: ${(x.p / maxWinsP) * 100}%`"
                        />
                    </td>
                </tr>
            </tbody>
        </table>

        <h2 class="text-lg font-bold">Remaining schedule</h2>
        <p v-if="!games.remaining.length">No games left.</p>
        <table v-else class="mb-4 border-collapse">
            <thead>
                <tr>
                    <th class="border px-2">Week</th>
                    <th class="border px-2 text-left">Date</th>
                    <th class="border px-2 text-left">Opponent</th>
                    <th class="border px-2">Win chance</th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="g in games.remaining"
                    :key="g.date + g.opponent.slug"
                >
                    <td class="border px-2 text-right">{{ g.week ?? '' }}</td>
                    <td class="border px-2">
                        {{ g.date }} {{ g.kickoff ?? '(time TBD)' }}
                    </td>
                    <td class="border px-2">
                        {{ where(g) }}
                        <Link
                            :href="`/${league.code}/${g.opponent.slug}`"
                            class="underline"
                            >{{ g.opponent.name }}</Link
                        >
                    </td>
                    <td class="border px-2 text-right">
                        {{ pct(g.p_win)
                        }}<em v-if="g.p_source === 'projected'">
                            (projected)</em
                        >
                    </td>
                </tr>
            </tbody>
        </table>

        <h2 class="text-lg font-bold">Results</h2>
        <table class="mb-4 border-collapse">
            <tbody>
                <tr v-for="g in games.results" :key="g.date + g.opponent.slug">
                    <td class="border px-2 text-right">{{ g.week ?? '' }}</td>
                    <td class="border px-2">{{ g.date }}</td>
                    <td class="border px-2">
                        {{ where(g) }} {{ g.opponent.name }}
                    </td>
                    <td class="border px-2">{{ g.result }} {{ g.score }}</td>
                </tr>
            </tbody>
        </table>
        <p>
            "Projected" win chances come from the model where no betting line
            exists yet; the rest are market lines.
            <Link href="/methodology" class="underline">How this works</Link>.
        </p>
    </SiteLayout>
</template>
