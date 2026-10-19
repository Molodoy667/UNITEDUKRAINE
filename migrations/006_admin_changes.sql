-- Website-owned queue only. No UPDATE/ALTER against game tables.
CREATE TABLE IF NOT EXISTS site_admin_changes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  actor_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  entity VARCHAR(20) NOT NULL,
  record_id INT NOT NULL,
  record_version CHAR(64) CHARACTER SET ascii NOT NULL,
  changes JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'awaiting_bridge',
  active_target VARCHAR(80) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME DEFAULT NULL,
  UNIQUE KEY admin_request_once (actor_id, request_id),
  UNIQUE KEY admin_active_target (active_target),
  INDEX admin_changes_status (status, created_at),
  INDEX admin_changes_target (entity, record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_admin_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id INT NOT NULL,
  event VARCHAR(24) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX admin_audit_change (change_id, id),
  INDEX admin_audit_time (created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_admin_limits (
  actor_id INT PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
