CREATE TABLE IF NOT EXISTS site_donation_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  bank_name VARCHAR(120) NOT NULL DEFAULT '',
  recipient_name VARCHAR(160) NOT NULL DEFAULT '',
  iban VARCHAR(64) NOT NULL DEFAULT '',
  card_number VARCHAR(40) NOT NULL DEFAULT '',
  tax_id VARCHAR(32) NOT NULL DEFAULT '',
  payment_instruction VARCHAR(500) NOT NULL DEFAULT '',
  rules_text TEXT NOT NULL,
  donate_per_uah SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  min_amount_uah INT UNSIGNED NOT NULL DEFAULT 50,
  max_amount_uah INT UNSIGNED NOT NULL DEFAULT 50000,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO site_donation_settings(id,rules_text) VALUES(1,'');

CREATE TABLE IF NOT EXISTS site_donation_packages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  image_url VARCHAR(2048) NOT NULL DEFAULT '',
  contents_json JSON NOT NULL,
  price_uah INT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  updated_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX donation_packages_public (active,sort_order,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_donation_operations (
  id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_id INT NOT NULL,
  nickname VARCHAR(24) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  package_id INT UNSIGNED NULL,
  package_title VARCHAR(120) NOT NULL DEFAULT '',
  package_image VARCHAR(2048) NOT NULL DEFAULT '',
  package_contents_json JSON NULL,
  amount_uah INT UNSIGNED NOT NULL,
  donate_amount INT UNSIGNED NOT NULL,
  payment_snapshot_json JSON NOT NULL,
  rules_version INT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  resolved_at DATETIME NULL,
  resolved_by INT NULL,
  reject_reason VARCHAR(500) NOT NULL DEFAULT '',
  balance_before INT UNSIGNED NULL,
  balance_after INT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY donation_request_id (request_id),
  INDEX donation_operation_status (status,created_at),
  INDEX donation_operation_account (account_id,created_at),
  INDEX donation_operation_nickname (nickname,created_at),
  CONSTRAINT donation_operation_package FOREIGN KEY (package_id) REFERENCES site_donation_packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_donation_ledger (
  operation_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  account_id INT NOT NULL,
  donate_amount INT UNSIGNED NOT NULL,
  balance_before INT UNSIGNED NOT NULL,
  balance_after INT UNSIGNED NOT NULL,
  approved_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX donation_ledger_account (account_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_donation_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event VARCHAR(48) NOT NULL,
  target VARCHAR(96) NOT NULL,
  before_json JSON NULL,
  after_json JSON NOT NULL,
  result_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY donation_audit_request (actor_id,request_id),
  INDEX donation_audit_recent (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_donation_limits (
  bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  reset_at DATETIME NOT NULL,
  INDEX donation_limits_expiry (reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
