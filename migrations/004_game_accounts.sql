-- Website-owned authentication state. Existing game accounts and property stay read-only.
CREATE TABLE IF NOT EXISTS site_account_sessions (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id INT NOT NULL,
  csrf CHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  credential_stamp CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX account_sessions_user (account_id),
  INDEX account_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_account_limits (
  bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  reset_at DATETIME NOT NULL,
  INDEX account_limits_expiry (reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_account_totp_steps (
  account_id INT PRIMARY KEY,
  last_step BIGINT NOT NULL DEFAULT -1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
