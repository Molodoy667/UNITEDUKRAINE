-- Existing installations already have a durable config. Do not replace it with the seed.
-- Only the former server 1 address is replaced; resource versions and other servers stay untouched.
UPDATE site_launcher_config
SET config_json = JSON_MERGE_PATCH(config_json,
      IF(JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."1.7.6".servers."1".ip')) = '51.75.44.14'
         AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."1.7.6".servers."1".port')) = '2219',
         '{"1.7.6":{"servers":{"1":{"ip":"94.23.168.153","port":2610}}}}', '{}'),
      IF(JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."0.0.0".servers."1".ip')) = '51.75.44.14'
         AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."0.0.0".servers."1".port')) = '2219',
         '{"0.0.0":{"servers":{"1":{"ip":"94.23.168.153","port":2610}}}}', '{}')),
    revision = revision + 1, updated_at = UTC_TIMESTAMP()
WHERE id = 1
  AND ((JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."1.7.6".servers."1".ip')) = '51.75.44.14'
        AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."1.7.6".servers."1".port')) = '2219')
    OR (JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."0.0.0".servers."1".ip')) = '51.75.44.14'
        AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$."0.0.0".servers."1".port')) = '2219'));
