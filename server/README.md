# Leaderboard backend (PHP + MySQL on Maxer)

The online leaderboard is a small PHP API (`api/`) backed by a MySQL database. The game talks only
to the API; nothing on the web can reach the database directly.

```
server/
  schema.sql          tables to import into pacifismquestdb
  config.sample.php   template for the secret config file (lives outside public_html)
  api/
    start.php         POST: registers a new run, returns its id
    submit.php        POST: validates a finished run and records the score
    leaderboard.php   GET:  top 20 for a difficulty
    lib.php           shared helpers (blocked from the web by .htaccess)
    blocklist.php     hate terms rejected in names (blocked from the web)
    .htaccess
```

## Setting it up in cPanel

1. **Check PHP.** In *MultiPHP Manager* (or *Select PHP Version*), make sure the site uses **PHP 8.1 or newer**
   with the `pdo_mysql` and `curl` extensions enabled.
2. **Create the database.** In *MySQL® Databases*:
   - Create a database called `pacifismquestdb`. cPanel adds your account name in front, e.g. `myacct_pacifismquestdb`.
   - Create a user, e.g. `pqapp`, with a long generated password.
   - Add the user to the database with **only** `SELECT`, `INSERT`, `UPDATE` and `DELETE`. It needs nothing else,
     so even a bug in the API couldn't drop or alter tables.
3. **Create the tables.** Open *phpMyAdmin*, select the database, choose *Import*, and upload `schema.sql`.
4. **Write the config file.** In *File Manager*, go to your **home folder** (the one that *contains* `public_html`,
   not `public_html` itself) and create `pacifism-config.php` from `config.sample.php`:
   - Fill in the full database name, user and password from step 2.
   - Set `ip_secret` to a random 64-character hex string. Run `php -r "echo bin2hex(random_bytes(32));"`
     locally, or use any password generator.
   - Set the file's permissions to `600` so only your account can read it.
5. **Upload the site.** Run `npm run build`, then upload everything inside `dist/` into `public_html`.
   That includes the game, the `api/` folder and `.htaccess`. Turn on hidden files in File Manager to see `.htaccess`.
6. **Turn on HTTPS.** Run *SSL/TLS Status* → *AutoSSL* for pacifism.quest. The `.htaccess` redirects all traffic to HTTPS.
7. **Check it works:**
   - `https://pacifism.quest/api/leaderboard.php?difficulty=0` should show `{"scores":[]}`.
   - `https://pacifism.quest/api/lib.php` should be **403 Forbidden**.
   - Play a game, submit a name, and open LEADERBOARD on the menu.

If `leaderboard.php` says *Leaderboard not configured*, the config file is in the wrong folder or misnamed.
If it says *Server error*, check cPanel's *Errors* page; details are logged there, never shown to players.

## Optional: bot protection with Cloudflare Turnstile

Turnstile is a free CAPTCHA that's usually invisible. It doesn't need your DNS on Cloudflare.

1. Create a free Cloudflare account and add a Turnstile widget for `pacifism.quest`.
2. Put the **secret key** in `pacifism-config.php` as `turnstile_secret`.
3. Copy `.env.example` to `.env`, set `VITE_TURNSTILE_SITE_KEY` to the **site key**, rebuild, and re-upload `dist/`.

## How submissions are checked

| Check | Stops |
|---|---|
| Only the API can write to the database, with prepared statements and a least-privilege user | Direct database access, SQL injection |
| The server records when each run starts. A run's game time can't exceed the real time since it started, and each run can be submitted once, within 7 hours | Made-up runs, replayed submissions, instant fake scores |
| The client sends kills, gates and gems, never a score. The server replays the game's spawn schedule to check they were possible, then calculates the score itself | Typing in an arbitrary score, impossible stat combinations |
| Names: 3–12 letters, numbers, spaces, `-` or `_`; racist and hate terms rejected (swearing allowed); always displayed as plain text | Offensive names, script injection |
| Rate limits per visitor (60 games per 10 minutes, 30 submissions per hour); IPs stored only as a keyed hash | Spam floods; no personal data stored |
| Optional Turnstile | Automated bots |

**Limits, honestly:** the server can only check that a run was *possible*, not that it was *played*. Someone
who studies the code could start a run, wait, and then claim the best stats that are possible for that much
time. Stopping that completely needs the server to replay every input, which this hosting can't run.
If a dubious score appears, remove it in phpMyAdmin:
`DELETE FROM scores WHERE id = …;`

## Keeping the rules in sync

The constants at the top of `api/lib.php` mirror `src/config.ts`: difficulty levels, points, and the wave
schedule. If you change those in the game, change them here too, or real scores may be rejected.
