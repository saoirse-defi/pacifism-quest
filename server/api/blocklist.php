<?php
// Hate terms that can't appear anywhere in a leaderboard name (matched after removing spaces
// and undoing number-for-letter swaps). Swearing is allowed; slurs and hate symbols are not.
// Lowercase only. Short terms that appear inside innocent words (e.g. "coon" in "raccoon",
// "spic" in "spicy", "paki" in "Pakistan", the first name "Aryan") are left out to avoid
// blocking ordinary names.
return [
    // Racial and ethnic slurs
    'nigg', 'nigr', 'kike', 'chink', 'gook', 'wetback', 'beaner',
    'raghead', 'towelhead', 'sandnig', 'jigaboo', 'porchmonk', 'zipperhead', 'gypo',
    // Hate groups and slogans
    'nazi', 'hitler', 'heil', 'kkk', 'whitepower', 'whitepride', '1488', 'gasthe',
    // Slurs against other groups
    'faggot', 'tranny', 'retard',
];
