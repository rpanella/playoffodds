<?php

use App\Http\Controllers\SportsCrunchWebhookController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'Welcome')->name('home');

Route::post('/webhooks/sportscrunch', SportsCrunchWebhookController::class)->name('webhooks.sportscrunch');
