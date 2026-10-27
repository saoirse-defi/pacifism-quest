-- Pacifism Quest leaderboard schema (MySQL 5.7+ / MariaDB 10.3+).
-- Import into pacifismquestdb with phpMyAdmin (select the database → Import), or:
--   mysql -u USER -p DATABASE < schema.sql

-- One row per game started. The server records the start time itself, so a submitted
-- score can be checked against how long the run really lasted. A run can be submitted once.
CREATE TABLE IF NOT EXISTS runs (
  id          CHAR(32) CHARACTER SET ascii NOT NULL,  -- random 128-bit id, hex
  difficulty  TINYINT UNSIGNED NOT NULL,              -- index into the game's DIFFICULTIES list
  started_ms  BIGINT UNSIGNED NOT NULL,               -- server clock, Unix milliseconds
  ip_hash     BINARY(32) NOT NULL,                    -- HMAC of the IP address; raw IPs are never stored
  submitted   TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY runs_ip_time (ip_hash, started_ms),
  KEY runs_cleanup (submitted, started_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Accepted leaderboard entries. The score is calculated by the server, never taken from the client.
CREATE TABLE IF NOT EXISTS scores (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id       CHAR(32) CHARACTER SET ascii NOT NULL,
  name         VARCHAR(12) NOT NULL,
  score        BIGINT UNSIGNED NOT NULL,
  difficulty   TINYINT UNSIGNED NOT NULL,
  duration_ms  INT UNSIGNED NOT NULL,
  kills        INT UNSIGNED NOT NULL,
  gates        INT UNSIGNED NOT NULL,
  gems         INT UNSIGNED NOT NULL,
  ip_hash      BINARY(32) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY scores_run (run_id),
  KEY scores_board (difficulty, score),
  KEY scores_ip_time (ip_hash, created_at),
  CONSTRAINT scores_run_fk FOREIGN KEY (run_id) REFERENCES runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
