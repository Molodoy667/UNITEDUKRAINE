-- Website-owned CMS only. No game-table or engine changes.
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  value_json JSON NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by INT DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_documents (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  slug VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(180) NOT NULL,
  excerpt VARCHAR(600) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  image VARCHAR(2048) NOT NULL DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT '',
  seo_title VARCHAR(180) NOT NULL DEFAULT '',
  seo_description VARCHAR(400) NOT NULL DEFAULT '',
  published TINYINT NOT NULL DEFAULT 0,
  published_at DATETIME DEFAULT NULL,
  deleted_at DATETIME DEFAULT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by INT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY site_document_slug (kind,slug),
  INDEX site_public_documents (kind,published,deleted_at,published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_content_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event VARCHAR(40) NOT NULL,
  target VARCHAR(100) NOT NULL,
  before_json JSON DEFAULT NULL,
  after_json JSON DEFAULT NULL,
  result_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY site_content_request (actor_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO site_settings(setting_key,value_json) VALUES
('seo','{"siteName":"United Ukraine Roleplay","title":"United Ukraine — Твоя країна. Твоя історія.","description":"United Ukraine Roleplay — українська ігрова платформа КРМП. Почни свою історію.","keywords":"United Ukraine, Roleplay, КРМП","siteUrl":"https://united-rp.com.ua","image":"/assets/world-promo.png"}'),
('home',JSON_OBJECT('headline','ТВОЯ КРАЇНА.','highlight','ТВОЯ ІСТОРІЯ.','description','Знайомі вулиці. Нові можливості.\nЦілий світ, щоб стати собою.','aboutTitle','ЗНАЙОМІ МІСЦЯ. БЕЗМЕЖНІ МОЖЛИВОСТІ.','aboutText','Тут кожна дорога — початок історії.\nА головний герой — ти.','discordUrl','https://discord.gg/GyJnWJXdJ','trailerUrl','')),
('launcher','{"version":"","downloadUrl":"","resourcesEnabled":false,"resourcesUrl":"","resourcesVersion":"","resourcesUpdateUrl":"","maintenance":false,"maintenanceMessage":""}');

-- Preserve the existing site's published text; these legal drafts still need
-- operator review. No invented news, release/version or download URL is seeded.
INSERT IGNORE INTO site_documents(kind,slug,title,body,published) VALUES
('page','contacts','Контакти','Офіційний канал зв’язку з командою United Ukraine Roleplay — наш Discord. Звертайся до адміністрації спільноти з питаннями про гру та роботу проєкту.',1),
('page','terms','Умови користування','Проєкт документа · умови потребують затвердження адміністрацією перед публічним запуском сервісів.\n\nСайт знайомить відвідувачів із United Ukraine Roleplay. Умови доступу до гри, правила сервера та заходи модерації буде оприлюднено адміністрацією окремо.\n\nКористувачі мають поважати інших учасників, не видавати себе за адміністрацію та не поширювати шкідливі файли чи матеріали.\n\nОсобистий кабінет дозволяє переглядати персонажа та його майно після входу в ігровий акаунт. Платежі на цій версії сайту не активовані; умови придбання послуг і повернення коштів мають бути опубліковані до запуску донату.\n\nЗ питань користування звертайся до команди через офіційний Discord.',1),
('page','privacy','Політика конфіденційності','Проєкт документа · потребує доповнення даними оператора сайту та затвердження перед публічним запуском.\n\nФорум зберігає в базі облікові записи, email, хеші паролів, профілі, теми, повідомлення, приватні діалоги, сповіщення та журнал адміністративних дій. Теги й ролі визначають оформлення та права доступу.\n\nДля входу використовується захищений cookie сеансу. Для протидії зловживанням API використовує псевдонімізовані ключі на основі IP-адреси. Секрети двофакторної автентифікації зберігаються зашифрованими.\n\nПісля налаштування поштового сервісу листи підтвердження та відновлення надсилаються через Resend. Поштові сповіщення про активність вмикаються користувачем окремо. Вкладення після налаштування сховища зберігаються у приватному Cloudflare R2; доступ до них перевіряє сервер.\n\nІнфраструктура хостингу може обробляти технічні дані запитів. Строки зберігання, порядок видалення даних і реквізити оператора мають бути уточнені адміністрацією до публічного запуску.\n\nПосилання на Discord ведуть на сторонній сервіс, де діють його власні правила обробки даних.\n\nЗ питаннями щодо даних звертайся до адміністрації в офіційному Discord.',1);
