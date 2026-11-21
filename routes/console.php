<?php

use Illuminate\Support\Facades\Schedule;

// The daily snapshot for each league (02 §3 step 1). Runs after game finals come with the webhook trigger.
foreach (config()->array('leagues') as $code => $league) {
    Schedule::command("snapshot:run {$code} --trigger=scheduled")
        ->dailyAt($league['daily_snapshot_time'])
        ->timezone($league['timezone'])
        ->withoutOverlapping()
        ->onOneServer();
}
