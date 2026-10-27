<?php
// Copy this file to the folder ABOVE public_html (your home folder) as pacifism-config.php
// and fill in the values. It must never be inside public_html, where it could be downloaded.

return [
    // cPanel prefixes database and user names with your account name, e.g. "myacct_pacifismquestdb".
    'db_dsn'  => 'mysql:host=localhost;dbname=ACCOUNT_pacifismquestdb;charset=utf8mb4',
    'db_user' => 'ACCOUNT_pqapp',
    'db_pass' => 'CHANGE-ME',

    // Secret used to anonymise IP addresses before they are stored (for rate limiting).
    // Generate one with:  php -r "echo bin2hex(random_bytes(32));"
    'ip_secret' => 'CHANGE-ME',

    // Optional Cloudflare Turnstile bot check (free, no DNS changes needed).
    // Leave empty to turn it off; set the matching site key in the game's .env file.
    'turnstile_secret' => '',

    // Extra origins allowed to call the API, e.g. 'http://localhost:5173' for local testing.
    // The game's own site (same origin) always works and doesn't need listing.
    'allowed_origins' => [],
];
