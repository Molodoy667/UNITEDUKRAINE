-- Move built-in site media to WebP and add managed Project/Android image settings.
UPDATE site_settings
SET value_json=JSON_SET(
 value_json,
 '$.logo',CASE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.logo')) WHEN '/assets/logo.png' THEN '/assets/logo.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.logo')) END,
 '$.images.hero',CASE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.hero')) WHEN '/assets/world-promo.png' THEN '/assets/world-promo.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.hero')) END,
 '$.images.world',CASE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.world')) WHEN '/assets/world.jpg' THEN '/assets/world.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.world')) END,
 '$.images.gallery1',CASE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.gallery1')) WHEN '/assets/world.jpg' THEN '/assets/world.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.gallery1')) END,
 '$.images.gallery2',CASE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.gallery2')) WHEN '/assets/world.jpg' THEN '/assets/world.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.gallery2')) END,
 '$.images.gallery3',CASE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.gallery3')) WHEN '/assets/world.jpg' THEN '/assets/world.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.images.gallery3')) END,
 '$.projectBackground',CASE COALESCE(JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.projectBackground')),'') WHEN '' THEN '/Project/background.webp' WHEN '/Project/background.png' THEN '/Project/background.webp' ELSE JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.projectBackground')) END,
 '$.androidLogo',COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.androidLogo')),''),'/assets/logo.webp')
),
version=version+1,updated_at=UTC_TIMESTAMP()
WHERE setting_key='builder'
 AND (JSON_SEARCH(value_json,'one','/assets/logo.png') IS NOT NULL
   OR JSON_SEARCH(value_json,'one','/assets/world-promo.png') IS NOT NULL
   OR JSON_SEARCH(value_json,'one','/assets/world.jpg') IS NOT NULL
   OR JSON_EXTRACT(value_json,'$.projectBackground') IS NULL
   OR JSON_EXTRACT(value_json,'$.androidLogo') IS NULL);

UPDATE site_settings
SET value_json=JSON_SET(value_json,'$.image','/assets/world-promo.webp'),version=version+1,updated_at=UTC_TIMESTAMP()
WHERE setting_key='seo' AND JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.image'))='/assets/world-promo.png';

UPDATE site_documents
SET image=CASE image WHEN '/assets/world-promo.png' THEN '/assets/world-promo.webp' WHEN '/assets/world.jpg' THEN '/assets/world.webp' ELSE image END,
 version=version+1,updated_at=UTC_TIMESTAMP()
WHERE image IN ('/assets/world-promo.png','/assets/world.jpg');
