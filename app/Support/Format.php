<?php

namespace App\Support;

/** Number formatting shared by server-rendered text (features/10 §5). The Vue side mirrors it in lib/format.ts. */
final class Format
{
    /** One decimal; values that would round to 0 or 100 show as "<0.1%" and ">99.9%". */
    public static function pct(float $p): string
    {
        $value = round($p * 100, 1);
        if ($value <= 0.0) {
            return '<0.1%';
        }
        if ($value >= 100.0) {
            return '>99.9%';
        }

        return number_format($value, 1).'%';
    }

    /** W-L, or W-L-T when there are ties. */
    public static function record(int $w, int $l, int $t): string
    {
        return $t > 0 ? "{$w}-{$l}-{$t}" : "{$w}-{$l}";
    }
}
