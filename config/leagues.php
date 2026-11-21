<?php

/*
| Leagues PlayoffOdds covers. The SportsCrunch sync creates each league's row from here.
|
| `conferences` maps SportsCrunch's conference names to the short codes the standings engine
| uses. A name missing from the map fails the sync rather than being guessed.
*/

return [
    'nfl' => [
        'name' => 'NFL',
        'timezone' => 'America/New_York',
        'daily_snapshot_time' => '09:00',
        'conferences' => [
            'American Football Conference' => 'AFC',
            'National Football Conference' => 'NFC',
        ],
    ],
];
