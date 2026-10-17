CREATE TABLE IF NOT EXISTS forum_roles (
  id VARCHAR(32) PRIMARY KEY, name VARCHAR(80) NOT NULL, color VARCHAR(7) NOT NULL DEFAULT '#9ca3af',
  rank_value INT NOT NULL DEFAULT 10, permissions JSON NOT NULL, system_role BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  role_id VARCHAR(32) NOT NULL DEFAULT 'player', email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  bio VARCHAR(1000) NOT NULL DEFAULT '', signature VARCHAR(300) NOT NULL DEFAULT '',
  avatar_id INT UNSIGNED NULL, cover_id INT UNSIGNED NULL, preferences JSON NULL,
  totp_secret VARCHAR(255) NULL, totp_pending VARCHAR(255) NULL, totp_last_step BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at DATETIME NULL,
  INDEX(last_seen_at), FOREIGN KEY(role_id) REFERENCES forum_roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_user_roles (
  user_id INT UNSIGNED NOT NULL, role_id VARCHAR(32) NOT NULL, PRIMARY KEY(user_id,role_id),
  FOREIGN KEY(user_id) REFERENCES forum_users(id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES forum_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_sessions (
  id CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL, csrf CHAR(48) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, agent VARCHAR(200) NOT NULL DEFAULT '',
  INDEX(user_id), INDEX(expires_at), FOREIGN KEY(user_id) REFERENCES forum_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_tokens (
  id CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL, purpose VARCHAR(20) NOT NULL,
  payload VARCHAR(254) NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX(user_id,purpose), FOREIGN KEY(user_id) REFERENCES forum_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_limits (
  id CHAR(64) PRIMARY KEY, hits INT UNSIGNED NOT NULL DEFAULT 1, expires_at DATETIME NOT NULL, INDEX(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_boards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, parent_id INT UNSIGNED NULL, title VARCHAR(120) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '', rules TEXT NULL, icon VARCHAR(24) NOT NULL DEFAULT 'messages',
  position INT NOT NULL DEFAULT 0, is_category BOOLEAN NOT NULL DEFAULT FALSE,
  access JSON NULL, form_fields JSON NULL, require_approval BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY(parent_id) REFERENCES forum_boards(id), INDEX(parent_id,position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_moderators (
  board_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, PRIMARY KEY(board_id,user_id),
  FOREIGN KEY(board_id) REFERENCES forum_boards(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES forum_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_topics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, board_id INT UNSIGNED NOT NULL, author_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL, prefix VARCHAR(40) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open', pinned BOOLEAN NOT NULL DEFAULT FALSE,
  private_topic BOOLEAN NOT NULL DEFAULT FALSE, approved BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_to INT UNSIGNED NULL, form_data JSON NULL, deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(board_id) REFERENCES forum_boards(id), FOREIGN KEY(author_id) REFERENCES forum_users(id),
  FOREIGN KEY(assigned_to) REFERENCES forum_users(id), INDEX(board_id,deleted_at,approved,pinned,updated_at),
  INDEX(author_id,created_at), FULLTEXT KEY topic_search(title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_posts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, topic_id INT UNSIGNED NOT NULL, author_id INT UNSIGNED NOT NULL,
  body MEDIUMTEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT TRUE, deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, edited_at DATETIME NULL,
  FOREIGN KEY(topic_id) REFERENCES forum_topics(id), FOREIGN KEY(author_id) REFERENCES forum_users(id),
  INDEX(topic_id,approved,deleted_at,id), INDEX(author_id,created_at), FULLTEXT KEY post_search(body)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_revisions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_id INT UNSIGNED NOT NULL, editor_id INT UNSIGNED NOT NULL,
  body MEDIUMTEXT NOT NULL, reason VARCHAR(300) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(post_id) REFERENCES forum_posts(id), FOREIGN KEY(editor_id) REFERENCES forum_users(id), INDEX(post_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_reactions (
  post_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, reaction VARCHAR(16) NOT NULL,
  PRIMARY KEY(post_id,user_id), FOREIGN KEY(post_id) REFERENCES forum_posts(id), FOREIGN KEY(user_id) REFERENCES forum_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_subscriptions (
  topic_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  subscribed BOOLEAN NOT NULL DEFAULT TRUE, last_read_post_id INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY(topic_id,user_id), FOREIGN KEY(topic_id) REFERENCES forum_topics(id), FOREIGN KEY(user_id) REFERENCES forum_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_drafts (
  user_id INT UNSIGNED NOT NULL, draft_key VARCHAR(80) NOT NULL, title VARCHAR(160) NOT NULL DEFAULT '', body MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,draft_key), FOREIGN KEY(user_id) REFERENCES forum_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_polls (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, topic_id INT UNSIGNED NOT NULL UNIQUE, question VARCHAR(200) NOT NULL,
  options JSON NOT NULL, closes_at DATETIME NULL, FOREIGN KEY(topic_id) REFERENCES forum_topics(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_votes (
  poll_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, choice INT UNSIGNED NOT NULL,
  PRIMARY KEY(poll_id,user_id), FOREIGN KEY(poll_id) REFERENCES forum_polls(id), FOREIGN KEY(user_id) REFERENCES forum_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL UNIQUE, color VARCHAR(7) NOT NULL DEFAULT '#f5cb70', position INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_user_tags (
  user_id INT UNSIGNED NOT NULL, tag_id INT UNSIGNED NOT NULL, PRIMARY KEY(user_id,tag_id),
  FOREIGN KEY(user_id) REFERENCES forum_users(id), FOREIGN KEY(tag_id) REFERENCES forum_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_penalties (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, actor_id INT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL, reason VARCHAR(500) NOT NULL, points INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NULL, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES forum_users(id), FOREIGN KEY(actor_id) REFERENCES forum_users(id), INDEX(user_id,revoked_at,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, actor_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES forum_users(id), FOREIGN KEY(actor_id) REFERENCES forum_users(id), INDEX(user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, reporter_id INT UNSIGNED NOT NULL,
  post_id INT UNSIGNED NULL, user_id INT UNSIGNED NULL, message_id INT UNSIGNED NULL,
  reason VARCHAR(1000) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'open', resolution VARCHAR(1000) NULL,
  resolved_by INT UNSIGNED NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(reporter_id) REFERENCES forum_users(id), FOREIGN KEY(post_id) REFERENCES forum_posts(id),
  FOREIGN KEY(user_id) REFERENCES forum_users(id), INDEX(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, actor_id INT UNSIGNED NULL,
  kind VARCHAR(24) NOT NULL, topic_id INT UNSIGNED NULL, post_id INT UNSIGNED NULL, conversation_id INT UNSIGNED NULL,
  message VARCHAR(300) NOT NULL, read_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES forum_users(id), INDEX(user_id,read_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_participants (
  conversation_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, last_read_id INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY(conversation_id,user_id), FOREIGN KEY(conversation_id) REFERENCES forum_conversations(id), FOREIGN KEY(user_id) REFERENCES forum_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conversation_id INT UNSIGNED NOT NULL, author_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES forum_conversations(id), FOREIGN KEY(author_id) REFERENCES forum_users(id), INDEX(conversation_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_blocks (
  user_id INT UNSIGNED NOT NULL, blocked_id INT UNSIGNED NOT NULL, PRIMARY KEY(user_id,blocked_id),
  FOREIGN KEY(user_id) REFERENCES forum_users(id), FOREIGN KEY(blocked_id) REFERENCES forum_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, owner_id INT UNSIGNED NOT NULL, object_key VARCHAR(200) NOT NULL UNIQUE,
  filename VARCHAR(150) NOT NULL, mime VARCHAR(80) NOT NULL, size_bytes INT UNSIGNED NOT NULL,
  post_id INT UNSIGNED NULL, conversation_id INT UNSIGNED NULL, purpose VARCHAR(16) NOT NULL DEFAULT 'post',
  ready BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES forum_users(id), FOREIGN KEY(post_id) REFERENCES forum_posts(id),
  FOREIGN KEY(conversation_id) REFERENCES forum_conversations(id), INDEX(owner_id,ready)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_audit (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id INT UNSIGNED NULL, action VARCHAR(60) NOT NULL,
  target_type VARCHAR(24) NOT NULL, target_id VARCHAR(64) NOT NULL, details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX(created_at), INDEX(target_type,target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS forum_settings (
  setting_key VARCHAR(60) PRIMARY KEY, setting_value JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO forum_roles(id,name,color,rank_value,permissions,system_role) VALUES
 ('owner','Власник','#f5cb70',100,'["*"]',TRUE),
 ('admin','Адміністратор','#f87171',80,'["manage","moderate","penalize","reports","audit"]',TRUE),
 ('global_mod','Старший модератор','#a78bfa',60,'["moderate","penalize","reports"]',TRUE),
 ('moderator','Модератор','#60a5fa',40,'["reports"]',TRUE),
 ('player','Гравець','#a7b1bf',10,'[]',TRUE);
INSERT IGNORE INTO forum_settings(setting_key,setting_value) VALUES
 ('general','{"title":"United Ukraine · Форум","announcement":"","editMinutes":30,"maxAttachmentMB":8,"prefixes":["Питання","Пропозиція","Інструкція","Вирішено","Відхилено"],"warningThreshold":0,"warningMuteHours":24,"registrationOpen":true}');
INSERT IGNORE INTO forum_boards(id,parent_id,title,description,position,is_category,access,form_fields) VALUES
 (1,NULL,'Інформація проєкту','Офіційна інформація United Ukraine',10,TRUE,NULL,NULL),
 (2,1,'Правила та оголошення','Правила, оголошення й важливі повідомлення',10,FALSE,'{"create":["owner","admin"],"reply":["owner","admin"]}',NULL),
 (3,1,'Інструкції та оновлення','Допомога новачкам та новини проєкту',20,FALSE,'{"create":["owner","admin"],"reply":["owner","admin"]}',NULL),
 (4,NULL,'Спільнота','Знайомства та спільні історії',20,TRUE,NULL,NULL),
 (5,4,'Загальне спілкування','Обговорення, знайомства, скриншоти та відео',10,FALSE,NULL,NULL),
 (6,NULL,'Ігрові сервери','Організації та життя серверів',30,TRUE,NULL,NULL),
 (7,6,'Сервер №1','Обговорення ігрового сервера',10,FALSE,NULL,NULL),
 (8,6,'Державні організації','Поліція, медицина, армія та інші фракції',20,FALSE,NULL,NULL),
 (9,6,'Неофіційні організації','Родини та об’єднання',30,FALSE,NULL,NULL),
 (10,NULL,'Звернення та підтримка','Допомога гравцям і розгляд звернень',40,TRUE,NULL,NULL),
 (11,10,'Скарги та оскарження','Приватні звернення до команди',10,FALSE,'{"privateDefault":true,"privateRequired":true}',
 '[{"key":"nickname","label":"Ваш ігровий нік","required":true},{"key":"server","label":"Сервер","required":true},{"key":"date","label":"Дата події","required":true},{"key":"participants","label":"Учасники","required":true},{"key":"evidence","label":"Посилання на докази","required":true}]'),
 (12,10,'Технічна підтримка','Питання та повідомлення про помилки',20,FALSE,NULL,NULL),
 (13,10,'Пропозиції','Ідеї для розвитку проєкту',30,FALSE,NULL,NULL),
 (14,NULL,'Команда проєкту','Закриті обговорення співробітників',50,TRUE,'{"view":["owner","admin","global_mod","moderator"]}',NULL),
 (15,14,'Внутрішні обговорення','Робочі питання команди',10,FALSE,NULL,NULL),
 (16,NULL,'Архів','Завершені обговорення',60,TRUE,NULL,NULL),
 (17,16,'Архів тем','Обговорення тільки для читання',10,FALSE,'{"create":["owner","admin"],"reply":["owner","admin"]}',NULL);
