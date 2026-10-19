-- Explicit dispatch is separate from proposals created before bridge support.
CREATE TABLE IF NOT EXISTS site_admin_bridge (
  bridge_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  instance_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  protocol INT NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 0,
  capabilities JSON NOT NULL,
  heartbeat_at DATETIME NOT NULL,
  detail_code VARCHAR(40) NOT NULL DEFAULT 'ready'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_admin_dispatch (
  change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  bridge_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dispatched_by INT NOT NULL,
  snapshot JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  finished_at DATETIME DEFAULT NULL,
  result_code VARCHAR(40) DEFAULT NULL,
  instance_id VARCHAR(64) DEFAULT NULL,
  INDEX admin_dispatch_bridge (bridge_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
