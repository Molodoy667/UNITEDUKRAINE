-- The operator requested public registration without email verification.
-- Preserve all other forum settings and keep the admin toggle available afterward.
UPDATE forum_settings
SET setting_value = JSON_SET(setting_value, '$.registrationOpen', TRUE)
WHERE setting_key = 'general';
