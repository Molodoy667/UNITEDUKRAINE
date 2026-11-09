CREATE TABLE IF NOT EXISTS site_news_videos (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 size_bytes INT UNSIGNED NOT NULL,
 owner_id INT NOT NULL,
 ready TINYINT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX news_video_cleanup(ready,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS site_news_video_chunks (
 video_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 part INT UNSIGNED NOT NULL,
 data MEDIUMBLOB NOT NULL,
 PRIMARY KEY(video_id,part),
 FOREIGN KEY(video_id) REFERENCES site_news_videos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS site_news_options (
 document_id INT PRIMARY KEY,
 video_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 placement TINYINT UNSIGNED DEFAULT NULL CHECK (placement BETWEEN 0 AND 3),
 INDEX news_by_video(video_id),
 FOREIGN KEY(document_id) REFERENCES site_documents(id) ON DELETE CASCADE,
 FOREIGN KEY(video_id) REFERENCES site_news_videos(id)
) ENGINE=InnoDB;
