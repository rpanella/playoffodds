<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';

defineProps<{
    meta?: { as_of: string; stale: boolean; origin: string } | null;
}>();
</script>

<template>
    <Head>
        <link rel="canonical" :href="$page.props.canonical as string" />
    </Head>
    <div class="mx-auto max-w-5xl p-4 text-sm">
        <header class="mb-4 flex flex-wrap items-baseline gap-4 border-b pb-2">
            <Link href="/" class="font-bold">PlayoffOdds</Link>
            <nav class="flex gap-3">
                <Link href="/nfl" class="underline">NFL odds</Link>
                <Link href="/nfl/seeds" class="underline">Seeds</Link>
                <Link href="/methodology" class="underline">Methodology</Link>
            </nav>
            <span class="ml-auto text-gray-500">Preview: wireframe</span>
        </header>

        <p
            v-if="meta?.stale"
            role="alert"
            class="mb-4 border border-amber-600 p-2"
        >
            These odds may be out of date: the last update was {{ meta.as_of }}.
        </p>

        <main>
            <slot />
        </main>

        <footer class="mt-8 border-t pt-2 text-gray-500">
            <span v-if="meta">Updated {{ meta.as_of }}.</span>
            Probabilities come from simulating the rest of the season; see the
            <Link href="/methodology" class="underline">methodology</Link>.
        </footer>
    </div>
</template>
