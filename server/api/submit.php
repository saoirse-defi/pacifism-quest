<?php
// POST {"runId", "name", "kills", "gates", "gems", "durationMs", "turnstileToken"?} → {"score", "rank"}
//
// The client reports what happened in the run; the server decides whether that was possible
// and calculates the score itself with the game's formula:
//   score = (kills × 50 + gates × 20) × (1 + gems) × difficulty level
declare(strict_types=1);
require __DIR__ . '/lib.php';

begin('POST');
$data = json_body();

$runId = $data['runId'] ?? null;
if (!is_string($runId) || !preg_match('/^[0-9a-f]{32}$/', $runId)) fail(400, 'Invalid run');
$name = clean_name($data['name'] ?? null);
$kills = int_field($data, 'kills', 0, 10_000_000);
$gates = int_field($data, 'gates', 0, 10_000_000);
$gems = int_field($data, 'gems', 0, 10_000_000);
$durationMs = int_field($data, 'durationMs', 1000, MAX_RUN_MS);
check_turnstile($data['turnstileToken'] ?? null);

$pdo = db();
$ip = ip_hash();
$now = now_ms();

$recent = $pdo->prepare('SELECT COUNT(*) FROM scores WHERE ip_hash = ? AND created_at > NOW() - INTERVAL 1 HOUR');
$recent->execute([$ip]);
if ((int) $recent->fetchColumn() >= SUBMISSIONS_PER_IP_PER_HOUR) fail(429, 'Too many submissions, try again later');

$pdo->beginTransaction(); // if we fail() below, the connection closes and the transaction rolls back
$find = $pdo->prepare('SELECT difficulty, started_ms, submitted FROM runs WHERE id = ? FOR UPDATE');
$find->execute([$runId]);
$run = $find->fetch();
if (!$run || (int) $run['submitted'] === 1) fail(409, 'This run was already submitted or has expired');

$wallMs = $now - (int) $run['started_ms'];
if ($wallMs > RUN_EXPIRY_MS) fail(410, 'This run has expired');
// Game time excludes pauses, so it can be shorter than the real time since the run started, never longer.
if ($durationMs > $wallMs + CLOCK_SLACK_MS) fail(422, 'Score rejected');

// Every kill leaves one gem and every wave brings at most one gate, so none of these can exceed what spawned.
[$maxWaves, $maxEnemies] = spawn_bounds($durationMs / 1000);
if ($kills > $maxEnemies || $gates > $maxWaves || $gems > $kills) fail(422, 'Score rejected');

$difficulty = (int) $run['difficulty'];
$score = ($kills * POINTS_PER_ENEMY + $gates * POINTS_PER_GATE) * (1 + $gems) * DIFFICULTY_LEVELS[$difficulty];
if ($score <= 0) fail(422, 'Nothing to submit');

$pdo->prepare('UPDATE runs SET submitted = 1 WHERE id = ?')->execute([$runId]);
$pdo->prepare(
    'INSERT INTO scores (run_id, name, score, difficulty, duration_ms, kills, gates, gems, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
)->execute([$runId, $name, $score, $difficulty, $durationMs, $kills, $gates, $gems, $ip]);
$pdo->commit();

$rank = $pdo->prepare('SELECT COUNT(*) + 1 FROM scores WHERE difficulty = ? AND score > ?');
$rank->execute([$difficulty, $score]);

respond(200, ['score' => $score, 'rank' => (int) $rank->fetchColumn()]);
