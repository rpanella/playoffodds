<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { computed, ref } from 'vue';
import SiteLayout from '@/layouts/SiteLayout.vue';
import { change, clinchLabel, pct, record } from '@/lib/format';
import type { League, Meta, TeamRow } from '@/types/odds';

const props = defineProps<{
    league: League;
    meta: Meta | null;
    conferences: {
        name: string;
        divisions: { name: string; teams: TeamRow[] }[];
    }[];
}>();

// Grouped by division on the server; sorting by playoff odds is a client-side toggle.
const sorted = ref(false);
const byOdds = computed(() =>
    props.conferences.map((c) => ({
        name: c.name,
        teams: c.divisions
            .flatMap((d) => d.teams)
            .sort((a, b) => b.p_playoffs - a.p_playoffs),
    })),
);
const title = computed(() =>
    `${props.league.name} Playoff Odds ${props.meta?.season ?? ''}`.trim(),
);
</script>

<template>
    <Head :title="title">
        <meta
            name="description"
            :content="`${league.name} playoff, division and Super Bowl odds for every team, from simulating the rest of the season.`"
        />
    </Head>
    <SiteLayout :meta="meta">
        <h1 class="mb-2 text-xl font-bold">{{ title }}</h1>
        <p v-if="!meta">No odds yet.</p>
        <template v-else>
            <p class="mb-2">
                Chances from {{ meta.sims.toLocaleString('en-US') }} simulated
                seasons, updated {{ meta.as_of }}. "Seed now" is the seed if the
                season ended today.
            </p>
            <label class="mb-2 block"
                ><input v-model="sorted" type="checkbox" /> Sort by playoff
                odds</label
            >

            <section
                v-for="(conf, ci) in conferences"
                :key="conf.name"
                class="mb-6 overflow-x-auto"
            >
                <h2 class="text-lg font-bold">{{ conf.name }}</h2>
                <table class="border-collapse">
                    <thead>
                        <tr>
                            <th class="border px-2 text-left">Team</th>
                            <th class="border px-2">Record</th>
                            <th class="border px-2">Seed now</th>
                            <th class="border px-2">Projected wins</th>
                            <th class="border px-2">Make playoffs</th>
                            <th class="border px-2">Win division</th>
                            <th class="border px-2">No. 1 seed</th>
                            <th class="border px-2">Reach Super Bowl</th>
                            <th class="border px-2">Win Super Bowl</th>
                            <th class="border px-2">1 day</th>
                            <th class="border px-2">7 days</th>
                            <th class="border px-2 text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody
                        v-for="group in sorted
                            ? [{ name: null, teams: byOdds[ci]!.teams }]
                            : conf.divisions"
                        :key="group.name ?? 'all'"
                    >
                        <tr v-if="group.name">
                            <th
                                colspan="12"
                                class="border bg-gray-100 px-2 text-left"
                            >
                                {{ group.name }}
                            </th>
                        </tr>
                        <tr v-for="t in group.teams" :key="t.id">
                            <td class="border px-2">
                                <Link
                                    :href="`/${league.code}/${t.slug}`"
                                    class="underline"
                                    >{{ t.name }}</Link
                                >
                            </td>
                            <td class="border px-2 text-right">
                                {{ record(t.record) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ t.seed_now ?? '–' }}
                            </td>
                            <td
                                class="border px-2 text-right"
                                :title="`10th–90th percentile: ${t.wins.p10}–${t.wins.p90}`"
                            >
                                {{ t.wins.mean.toFixed(1) }} ({{
                                    t.wins.p10
                                }}–{{ t.wins.p90 }})
                            </td>
                            <td class="border px-2 text-right">
                                {{ pct(t.p_playoffs) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ pct(t.p_division) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ pct(t.p_top_seed) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ pct(t.p_super_bowl) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ pct(t.p_champion) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ change(t.change_1d) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ change(t.change_7d) }}
                            </td>
                            <td class="border px-2">
                                {{ clinchLabel(t.clinch) ?? '' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <p>
                <Link :href="`/${league.code}/seeds`" class="underline"
                    >Seed probabilities</Link
                >
            </p>
        </template>
    </SiteLayout>
</template>
