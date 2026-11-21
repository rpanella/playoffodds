<?php

return [
    // HTTP basic auth for the whole site before launch. Both empty: the site is public. The
    // SportsCrunch webhook and the health check stay open.
    'basic_auth' => [
        'user' => env('SITE_BASIC_AUTH_USER'),
        'password' => env('SITE_BASIC_AUTH_PASSWORD'),
    ],
];
