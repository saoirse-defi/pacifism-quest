<?php
// Shared helpers for the leaderboard API. Requires PHP 8.1+ with PDO MySQL.
declare(strict_types=1);

// ─── Game rules (keep in sync with src/config.ts) ──────────────────────────────

/** Score multiplier for each difficulty index (DIFFICULTIES[].level). */
const DIFFICULTY_LEVELS = [3, 4, 5, 6, 7, 8];
const POINTS_PER_ENEMY = 50;
const POINTS_PER_GATE = 20;
const FIRST_WAVE_DELAY = 0.6;
const WAVE_INTERVAL = 100 / 60;
const MIN_WAVE_INTERVAL = 0.9;
const WAVE_GROWTH_TIME = 1000 / 60;
const MAX_WAVE_SIZE = 9;
const WAVE_RAMP_RATE = 0.004;

// ─── API limits ────────────────────────────────────────────────────────────────

const NAME_MAX_LENGTH = 12;
const MAX_BODY_BYTES = 4096;
const MAX_RUN_MS = 6 * 3600 * 1000;          // runs longer than this are not accepted
const RUN_EXPIRY_MS = 7 * 3600 * 1000;       // a run must be submitted within this long of starting
const CLOCK_SLACK_MS = 3000;                 // allowance for network delay between client and server clocks
const RUNS_PER_IP_PER_10_MIN = 60;
const SUBMISSIONS_PER_IP_PER_HOUR = 30;

// ─── Request handling ──────────────────────────────────────────────────────────

/** Sends security headers, handles CORS preflight, and enforces the HTTP method. */
function begin(string $method): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Referrer-Policy: no-referrer');

    set_exception_handler(static function (Throwable $e): void {
        error_log('pacifism-quest api: ' . $e); // details go to the server log, never to the client
        http_response_code(500);
        echo json_encode(['error' => 'Server error']);
    });

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, config()['allowed_origins'] ?? [], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST');
        header('Access-Control-Allow-Headers: Content-Type');
    }

    $actual = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($actual === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if ($actual !== $method) fail(405, 'Method not allowed');
}

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, ['error' => $message]);
}

/** Parses a small JSON request body. Requiring application/json also blocks cross-site form posts. */
function json_body(): array
{
    $type = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (!str_starts_with($type, 'application/json')) fail(415, 'Expected JSON');
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) fail(413, 'Request too large');
    $data = json_decode($raw, true);
    if (!is_array($data)) fail(400, 'Invalid JSON');
    return $data;
}

function int_field(array $data, string $key, int $min, int $max): int
{
    $value = $data[$key] ?? null;
    if (!is_int($value) || $value < $min || $value > $max) fail(400, 'Invalid ' . $key);
    return $value;
}

// ─── Infrastructure ────────────────────────────────────────────────────────────

function config(): array
{
    static $config = null;
    if ($config === null) {
        // Lives outside the web root: public_html/api/lib.php → ~/pacifism-config.php
        $path = getenv('PQ_CONFIG') ?: dirname(__DIR__, 2) . '/pacifism-config.php';
        if (!is_file($path)) {
            error_log('pacifism-quest api: missing config at ' . $path);
            fail(503, 'Leaderboard not configured');
        }
        $config = require $path;
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $pdo = new PDO($c['db_dsn'], $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false, // real prepared statements
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

/** Anonymised client identity for rate limiting. The raw IP is never stored. */
function ip_hash(): string
{
    return hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', config()['ip_secret'], true);
}

function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

// ─── Validation ────────────────────────────────────────────────────────────────

function clean_name(mixed $raw): string
{
    if (!is_string($raw)) fail(400, 'Invalid name');
    $name = trim((string) preg_replace('/\s+/', ' ', $raw));
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 _-]{2,' . (NAME_MAX_LENGTH - 1) . '}$/', $name)) {
        fail(400, 'Names are 3–12 letters, numbers, spaces, - or _');
    }
    if (is_hateful($name)) fail(400, 'Please choose a different name');
    return $name;
}

/** Swearing is fine; racist and other hate terms are not (see blocklist.php). */
function is_hateful(string $name): bool
{
    // Ignore separators, and also try undoing number-for-letter swaps (n1gg4 → nigga).
    $raw = (string) preg_replace('/[^a-z0-9]/', '', strtolower($name));
    $swapped = strtr($raw, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '8' => 'b', '9' => 'g']);
    foreach (require __DIR__ . '/blocklist.php' as $term) {
        if (str_contains($raw, $term) || str_contains($swapped, $term)) return true;
    }
    return false;
}

/** Optional Cloudflare Turnstile check; skipped when no secret is configured. */
function check_turnstile(mixed $token): void
{
    $secret = config()['turnstile_secret'] ?? '';
    if ($secret === '') return;
    if (!is_string($token) || $token === '' || strlen($token) > 2048) fail(400, 'Bot check missing');

    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['secret' => $secret, 'response' => $token, 'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '']),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    $result = is_string($response) ? json_decode($response, true) : null;
    if (($result['success'] ?? false) !== true) fail(403, 'Bot check failed');
}

/**
 * The most waves and enemies the game can have spawned in a run of this length,
 * replaying the spawn schedule from src/config.ts with a little slack.
 *
 * @return array{0: int, 1: int} [waves, enemies]
 */
function spawn_bounds(float $seconds): array
{
    $waves = 0;
    $enemies = 0;
    $rampStart = (MAX_WAVE_SIZE - 1) * WAVE_GROWTH_TIME;
    for ($t = FIRST_WAVE_DELAY; $t <= $seconds + 0.5; ) {
        $waves++;
        $enemies += min(MAX_WAVE_SIZE, 1 + (int) floor(($t + 0.5) / WAVE_GROWTH_TIME));
        $overtime = max(0.0, $t - $rampStart);
        $t += max(MIN_WAVE_INTERVAL, WAVE_INTERVAL - $overtime * WAVE_RAMP_RATE);
    }
    return [$waves, $enemies];
}
