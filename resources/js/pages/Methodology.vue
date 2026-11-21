<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import SiteLayout from '@/layouts/SiteLayout.vue';

defineProps<{
    current: {
        league: string;
        season: number;
        as_of: string;
        sims: number;
        engine_version: string;
        standings_version: string;
        rules_id: string;
        clinch_method: string | null;
        origin: string;
    }[];
}>();
</script>

<template>
    <Head title="How the playoff odds work">
        <meta
            name="description"
            content="How PlayoffOdds simulates the rest of the season, applies tiebreakers and decides clinches."
        />
    </Head>
    <SiteLayout>
        <h1 class="mb-2 text-xl font-bold">How the playoff odds work</h1>

        <h2 class="mt-4 text-lg font-bold">Game probabilities</h2>
        <p>
            Each remaining game has a win probability: the sportsbook consensus
            where a betting line exists, and a model built on those lines where
            one doesn't yet. Pages mark model-based chances as "projected".
        </p>

        <h2 class="mt-4 text-lg font-bold">Simulating the season</h2>
        <p>
            We play out the rest of the season many thousands of times. Teams'
            strength drifts within each simulated season the way betting lines
            have historically moved, so later games are less certain than next
            week's. Each simulated season then gets standings, seeds and a
            playoff bracket.
        </p>

        <h2 class="mt-4 text-lg font-bold">Tiebreakers</h2>
        <p>
            Standings and seeds follow the league's official tiebreaking
            procedure. When a tie would come down to a coin toss, or to point
            totals in games not played yet, the simulation decides it at random.
        </p>

        <h2 class="mt-4 text-lg font-bold">Clinched and eliminated</h2>
        <p>
            "Clinched" and "eliminated" are never read off a probability. A
            separate check proves them across every possible result of the
            remaining games. It is cautious: when a clinch depends on a
            tiebreaker, it may show up a week or so after the league announces
            it.
        </p>

        <h2 class="mt-4 text-lg font-bold">History</h2>
        <p>
            Charts show one point per day. Days before the odds were first
            published live are reconstructed later from historical lines and are
            drawn dashed.
        </p>

        <h2 class="mt-4 text-lg font-bold">Current run</h2>
        <table class="border-collapse">
            <thead>
                <tr>
                    <th class="border px-2 text-left">League</th>
                    <th class="border px-2">Updated</th>
                    <th class="border px-2">Simulations</th>
                    <th class="border px-2">Engine</th>
                    <th class="border px-2">Standings</th>
                    <th class="border px-2">Rules</th>
                    <th class="border px-2">Clinch check</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="c in current" :key="c.league">
                    <td class="border px-2">{{ c.league }} {{ c.season }}</td>
                    <td class="border px-2">{{ c.as_of }}</td>
                    <td class="border px-2 text-right">
                        {{ c.sims.toLocaleString('en-US') }}
                    </td>
                    <td class="border px-2">{{ c.engine_version }}</td>
                    <td class="border px-2">{{ c.standings_version }}</td>
                    <td class="border px-2">{{ c.rules_id }}</td>
                    <td class="border px-2">{{ c.clinch_method ?? '–' }}</td>
                </tr>
            </tbody>
        </table>
    </SiteLayout>
</template>
