<?php
// GET ?difficulty=0-5 → {"scores": [{"name", "score", "date"}, …]}  (top 20)
declare(strict_types=1);
require __DIR__ . '/lib.php';

begin('GET');
$difficulty = filter_var($_GET['difficulty'] ?? null, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 0, 'max_range' => count(DIFFICULTY_LEVELS) - 1],
]);
if ($difficulty === false) fail(400, 'Invalid difficulty');

$top = db()->prepare(
    "SELECT name, score, DATE_FORMAT(created_at, '%Y-%m-%d') AS date
     FROM scores WHERE difficulty = ? ORDER BY score DESC, created_at ASC LIMIT 20"
);
$top->execute([$difficulty]);
$scores = array_map(
    static fn (array $row): array => ['name' => $row['name'], 'score' => (int) $row['score'], 'date' => $row['date']],
    $top->fetchAll()
);

header('Cache-Control: public, max-age=15');
respond(200, ['scores' => $scores]);
