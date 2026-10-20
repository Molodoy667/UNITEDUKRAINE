CREATE TABLE IF NOT EXISTS site_launcher_config (
 id TINYINT NOT NULL PRIMARY KEY,
 config_json LONGTEXT NOT NULL,
 revision INT NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS site_android_release_channels (
 channel_id VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 files_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 archives_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS site_android_publications (
 publication_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 channel_id VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 previous_version INT NOT NULL,
 resources_version INT NOT NULL,
 files_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 archives_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json LONGTEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY android_channel_version(channel_id,resources_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
