<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { computed } from 'vue';
import SiteLayout from '@/layouts/SiteLayout.vue';
import { pct } from '@/lib/format';
import type { League, Meta, TeamRow } from '@/types/odds';

const props = defineProps<{
    league: League;
    meta: Meta | null;
    conferences: {
        name: string;
        teams: (TeamRow & { p_seed: number[]; p_miss: number })[];
    }[];
}>();

const title = computed(() =>
    `${props.league.name} Playoff Seed Odds ${props.meta?.season ?? ''}`.trim(),
);
// Shading supplements the printed number; it never replaces it.
const shade = (p: number) =>
    `background-color: rgba(0, 0, 0, ${(Math.min(1, p) * 0.35).toFixed(3)})`;
</script>

<template>
    <Head :title="title">
        <meta
            name="description"
            :content="`Each ${league.name} team's chance of every playoff seed.`"
        />
    </Head>
    <SiteLayout :meta="meta">
        <h1 class="mb-2 text-xl font-bold">{{ title }}</h1>
        <p v-if="!meta">No odds yet.</p>
        <section
            v-for="conf in conferences"
            :key="conf.name"
            class="mb-6 overflow-x-auto"
        >
            <h2 class="text-lg font-bold">{{ conf.name }}</h2>
            <table class="border-collapse">
                <thead class="sticky top-0 bg-white">
                    <tr>
                        <th class="border px-2 text-left">Team</th>
                        <th
                            v-for="i in conf.teams[0]?.p_seed.length ?? 7"
                            :key="i"
                            class="border px-2"
                        >
                            {{ i }}
                        </th>
                        <th class="border px-2">Miss</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="t in conf.teams" :key="t.id">
                        <td class="border px-2">
                            <Link
                                :href="`/${league.code}/${t.slug}`"
                                class="underline"
                                >{{ t.name }}</Link
                            >
                        </td>
                        <td
                            v-for="(p, i) in t.p_seed"
                            :key="i"
                            class="border px-2 text-right"
                            :style="shade(p)"
                        >
                            {{ pct(p) }}
                        </td>
                        <td
                            class="border px-2 text-right"
                            :style="shade(t.p_miss)"
                        >
                            {{ pct(t.p_miss) }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </section>
    </SiteLayout>
</template>
