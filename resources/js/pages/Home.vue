<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import SiteLayout from '@/layouts/SiteLayout.vue';
import { change, pct } from '@/lib/format';
import type { Meta, TeamRow } from '@/types/odds';

defineProps<{
    leagues: {
        code: string;
        name: string;
        meta: Meta | null;
        movers: TeamRow[];
    }[];
}>();
</script>

<template>
    <Head title="Playoff odds">
        <meta
            name="description"
            content="Playoff odds from simulating the rest of the season, updated daily and after every game."
        />
    </Head>
    <SiteLayout :meta="leagues[0]?.meta">
        <h1 class="mb-4 text-xl font-bold">Playoff odds</h1>
        <section v-for="league in leagues" :key="league.code" class="mb-6">
            <h2 class="text-lg font-bold">
                <Link :href="`/${league.code}`" class="underline"
                    >{{ league.name }} playoff odds</Link
                >
            </h2>
            <p v-if="!league.meta">No odds yet.</p>
            <template v-else>
                <p>
                    {{ league.meta.season }} season, updated
                    {{ league.meta.as_of }}.
                </p>
                <h3 class="mt-2 font-bold">Biggest movers since yesterday</h3>
                <p v-if="!league.movers.length">No movement yet.</p>
                <table v-else class="border-collapse">
                    <thead>
                        <tr>
                            <th class="border px-2 text-left">Team</th>
                            <th class="border px-2">Make playoffs</th>
                            <th class="border px-2">Change</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="t in league.movers" :key="t.id">
                            <td class="border px-2">
                                <Link
                                    :href="`/${league.code}/${t.slug}`"
                                    class="underline"
                                    >{{ t.name }}</Link
                                >
                            </td>
                            <td class="border px-2 text-right">
                                {{ pct(t.p_playoffs) }}
                            </td>
                            <td class="border px-2 text-right">
                                {{ change(t.change_1d) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </template>
        </section>
    </SiteLayout>
</template>
