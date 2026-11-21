<script setup lang="ts">
// Playoff odds over the season as plain SVG, so it renders on the server (features/11 §2). Reconstructed
// days are dashed, the team's results are marked along the bottom, and a data table follows the chart.
import { computed, ref } from 'vue';
import { pct } from '@/lib/format';

interface Point {
    date: string;
    origin: 'live' | 'reconstructed';
    p_playoffs: number;
    p_division: number;
    p_champion: number;
}

const props = defineProps<{
    points: Point[];
    results: {
        date: string;
        result: 'W' | 'L' | 'T';
        opponent: { abbreviation: string };
        home: boolean;
    }[];
    teamName: string;
}>();

const show = ref({ p_division: false, p_champion: false });
const W = 640;
const H = 220;
const pad = { left: 36, right: 8, top: 8, bottom: 36 };
const x = (i: number) =>
    pad.left +
    (props.points.length <= 1
        ? 0
        : (i / (props.points.length - 1)) * (W - pad.left - pad.right));
const y = (p: number) => pad.top + (1 - p) * (H - pad.top - pad.bottom);

/** One path per origin run, so reconstructed and live segments can be styled apart. */
function segments(key: 'p_playoffs' | 'p_division' | 'p_champion') {
    const out: { d: string; origin: string }[] = [];
    props.points.forEach((pt, i) => {
        const last = out[out.length - 1];
        const xy = `${x(i).toFixed(1)},${y(pt[key]).toFixed(1)}`;
        if (last && last.origin === pt.origin) {
            last.d += ` L${xy}`;
        } else {
            // Start the new run at the previous point so the line stays continuous.
            const prev =
                i > 0
                    ? `M${x(i - 1).toFixed(1)},${y(props.points[i - 1]![key]).toFixed(1)} L${xy}`
                    : `M${xy}`;
            out.push({ d: prev, origin: pt.origin });
        }
    });
    return out;
}

const series = computed(() =>
    [
        {
            key: 'p_playoffs' as const,
            label: 'Make playoffs',
            on: true,
            cls: 'stroke-black',
        },
        {
            key: 'p_division' as const,
            label: 'Win division',
            on: show.value.p_division,
            cls: 'stroke-gray-500',
        },
        {
            key: 'p_champion' as const,
            label: 'Win Super Bowl',
            on: show.value.p_champion,
            cls: 'stroke-gray-400',
        },
    ]
        .filter((s) => s.on)
        .map((s) => ({ ...s, segments: segments(s.key) })),
);

/** Each result at the first day on or after the game. */
const markers = computed(() =>
    props.results.map((r) => {
        const i = props.points.findIndex((p) => p.date >= r.date);
        return { ...r, x: x(i < 0 ? props.points.length - 1 : i) };
    }),
);

const firstLive = computed(
    () => props.points.find((p) => p.origin === 'live')?.date ?? null,
);
const summary = computed(() => {
    const first = props.points[0];
    const last = props.points[props.points.length - 1];
    return first && last
        ? `${props.teamName} playoff odds from ${pct(first.p_playoffs)} on ${first.date} to ${pct(last.p_playoffs)} on ${last.date}`
        : 'No history yet';
});
</script>

<template>
    <figure>
        <div class="mb-1 flex gap-4">
            <label
                ><input v-model="show.p_division" type="checkbox" /> Win
                division</label
            >
            <label
                ><input v-model="show.p_champion" type="checkbox" /> Win Super
                Bowl</label
            >
        </div>
        <svg
            :viewBox="`0 0 ${W} ${H}`"
            class="w-full max-w-2xl border"
            role="img"
            :aria-label="summary"
        >
            <g v-for="p in [0, 0.25, 0.5, 0.75, 1]" :key="p">
                <line
                    :x1="pad.left"
                    :x2="W - pad.right"
                    :y1="y(p)"
                    :y2="y(p)"
                    class="stroke-gray-200"
                />
                <text
                    :x="pad.left - 4"
                    :y="y(p) + 4"
                    text-anchor="end"
                    class="fill-gray-500 text-[10px]"
                >
                    {{ p * 100 }}%
                </text>
            </g>
            <template v-for="s in series" :key="s.key">
                <path
                    v-for="(seg, i) in s.segments"
                    :key="i"
                    :d="seg.d"
                    fill="none"
                    stroke-width="2"
                    :class="s.cls"
                    :stroke-dasharray="
                        seg.origin === 'reconstructed' ? '4 3' : undefined
                    "
                />
            </template>
            <text
                v-for="(m, i) in markers"
                :key="i"
                :x="m.x"
                :y="H - pad.bottom + 14"
                text-anchor="middle"
                class="text-[9px]"
                :class="m.result === 'W' ? 'fill-black' : 'fill-gray-500'"
            >
                {{ m.result }}
                <title>
                    {{ m.date }} {{ m.home ? 'vs' : '@' }}
                    {{ m.opponent.abbreviation }}: {{ m.result }}
                </title>
            </text>
            <text
                v-if="points.length"
                :x="pad.left"
                :y="H - 4"
                class="fill-gray-500 text-[10px]"
            >
                {{ points[0]!.date }}
            </text>
            <text
                v-if="points.length"
                :x="W - pad.right"
                :y="H - 4"
                text-anchor="end"
                class="fill-gray-500 text-[10px]"
            >
                {{ points[points.length - 1]!.date }}
            </text>
        </svg>
        <figcaption class="text-gray-500">
            Solid: computed at the time. Dashed: reconstructed later from
            historical lines<span v-if="firstLive">
                (before {{ firstLive }})</span
            >. Letters along the bottom are this team's results.
        </figcaption>
        <details class="mt-2">
            <summary>Show data</summary>
            <table class="mt-1 border-collapse">
                <thead>
                    <tr>
                        <th class="border px-2 text-left">Date</th>
                        <th class="border px-2">Playoffs</th>
                        <th class="border px-2">Division</th>
                        <th class="border px-2">Super Bowl</th>
                        <th class="border px-2">Origin</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="p in points" :key="p.date">
                        <td class="border px-2">{{ p.date }}</td>
                        <td class="border px-2 text-right">
                            {{ pct(p.p_playoffs) }}
                        </td>
                        <td class="border px-2 text-right">
                            {{ pct(p.p_division) }}
                        </td>
                        <td class="border px-2 text-right">
                            {{ pct(p.p_champion) }}
                        </td>
                        <td class="border px-2">{{ p.origin }}</td>
                    </tr>
                </tbody>
            </table>
        </details>
    </figure>
</template>
