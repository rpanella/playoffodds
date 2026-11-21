<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'sportscrunch' => [
        'url' => env('SPORTSCRUNCH_API_URL', 'https://sportscrunch.com'),
        'token' => env('SPORTSCRUNCH_API_KEY'),
        'timeout' => (int) env('SPORTSCRUNCH_API_TIMEOUT', 60),
        // The signing secret of the SportsCrunch account whose webhook URL points here.
        'webhook_secret' => env('SPORTSCRUNCH_WEBHOOK_SECRET'),
        // Reject webhooks whose payload timestamp is older than this (SportsCrunch retries for ~6 minutes).
        'webhook_tolerance_seconds' => 900,
    ],

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
