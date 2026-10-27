<?php
// POST {"difficulty": 0-5} → {"runId": "…"}
// Called when a game starts, so the server knows when the run really began.
declare(strict_types=1);
require __DIR__ . '/lib.php';

begin('POST');
$data = json_body();
$difficulty = int_field($data, 'difficulty', 0, count(DIFFICULTY_LEVELS) - 1);

$pdo = db();
$ip = ip_hash();
$now = now_ms();

$recent = $pdo->prepare('SELECT COUNT(*) FROM runs WHERE ip_hash = ? AND started_ms > ?');
$recent->execute([$ip, $now - 10 * 60 * 1000]);
if ((int) $recent->fetchColumn() >= RUNS_PER_IP_PER_10_MIN) fail(429, 'Too many games started, slow down');

$runId = bin2hex(random_bytes(16));
$pdo->prepare('INSERT INTO runs (id, difficulty, started_ms, ip_hash) VALUES (?, ?, ?, ?)')
    ->execute([$runId, $difficulty, $now, $ip]);

// Occasionally tidy up runs that were never submitted.
if (random_int(1, 50) === 1) {
    $pdo->prepare('DELETE FROM runs WHERE submitted = 0 AND started_ms < ?')->execute([$now - RUN_EXPIRY_MS]);
}

respond(200, ['runId' => $runId]);
