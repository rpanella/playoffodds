<?php

use App\Http\Controllers\OddsController;
use App\Http\Controllers\SportsCrunchWebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/sportscrunch', SportsCrunchWebhookController::class)->name('webhooks.sportscrunch');

Route::get('/', [OddsController::class, 'home'])->name('home');
Route::get('/methodology', [OddsController::class, 'methodology'])->name('methodology');
Route::get('/sitemap.xml', [OddsController::class, 'sitemap'])->name('sitemap');

// League pages: /nfl, /nfl/seeds, /nfl/{team-slug}.
Route::prefix('{league:code}')->where(['league' => implode('|', array_keys(config()->array('leagues')))])->group(function () {
    Route::get('/', [OddsController::class, 'league'])->name('league');
    Route::get('/seeds', [OddsController::class, 'seeds'])->name('league.seeds');
    Route::get('/{team}', [OddsController::class, 'team'])->name('team');
});
