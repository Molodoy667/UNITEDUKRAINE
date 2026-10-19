-- Operator explicitly approved converting game accounts for transactional roulette payments.
-- No columns or balances are changed; schedule deployment with a current DB backup.
SET @roulette_engine_sql = (SELECT IF(COUNT(*)=1 AND MAX(ENGINE)<>'InnoDB','ALTER TABLE accounts_1101 ENGINE=InnoDB','SELECT 1') FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts_1101');
PREPARE roulette_engine_change FROM @roulette_engine_sql;
EXECUTE roulette_engine_change;
DEALLOCATE PREPARE roulette_engine_change;

CREATE TABLE IF NOT EXISTS site_roulette_players (
  account_id INT PRIMARY KEY,
  free_spins INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_roulette_spins (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payment VARCHAR(10) NOT NULL,
  cost INT UNSIGNED NOT NULL DEFAULT 0,
  prize JSON NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  UNIQUE KEY roulette_request (account_id, request_id),
  INDEX roulette_history (account_id, created_at),
  INDEX roulette_pending (account_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_roulette_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spin_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_id INT NOT NULL,
  kind VARCHAR(10) NOT NULL,
  delta INT NOT NULL,
  balance_before INT NOT NULL,
  balance_after INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY roulette_money_once (spin_id, kind),
  INDEX roulette_money_account (account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
