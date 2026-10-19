-- Explicitly requested test article. Never overwrite an existing or deleted article.
INSERT INTO site_documents(kind,slug,title,excerpt,body,image,category,published,published_at)
SELECT 'news','test-launcher-news','Тестова новина: новини UNITED UKRAINE у лаунчері',
'Перевіряємо відображення фото та новин на сайті, в Electron і Unity.',
'Це тестова новина для перевірки підключення лаунчера. Вона не повідомляє про реальне оновлення гри.\n\nНовини беруться з бази сайту. Адміністратор може змінити заголовок, текст і фото або прибрати цей матеріал у кошик у розділі «API та новини».',
'/assets/world-promo.png','Тестова',1,UTC_TIMESTAMP()
WHERE NOT EXISTS (SELECT 1 FROM site_documents WHERE kind='news' AND slug='test-launcher-news');
