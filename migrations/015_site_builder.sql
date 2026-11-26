-- Site builder configuration for the editable header and homepage media.
-- Existing CMS content and site settings are preserved.
INSERT IGNORE INTO site_settings(setting_key,value_json) VALUES
('builder',JSON_OBJECT(
 'logo','/assets/logo.png',
 'navigation',JSON_ARRAY(
  JSON_OBJECT('id','home','label','Головна','href','/'),
  JSON_OBJECT('id','forum','label','Форум','href','/forum'),
  JSON_OBJECT('id','wiki','label','Вікі','href','/wiki'),
  JSON_OBJECT('id','roulette','label','Рулетка','href','/roulette'),
  JSON_OBJECT('id','forbes','label','Forbes','href','/forbes'),
  JSON_OBJECT('id','donate','label','Донат','href','/donate')
 ),
 'images',JSON_OBJECT(
  'hero','/assets/world-promo.png',
  'world','/assets/world.jpg',
  'gallery1','/assets/world.jpg',
  'gallery2','/assets/world.jpg',
  'gallery3','/assets/world.jpg'
 )
));
