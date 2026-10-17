# Wiki catalog

`/wiki` is a React view with skins, cars and accessories, ID/name search, 10/50/100 items per page and URL-backed pagination (`tab`, `size`, `page`, `q`). Browser Back/Forward restores selection. Previews are local static files; no game database or third-party CDN is required.

Imported from the operator-provided `uiresources` folder: 740 skin previews (including four variants), 693 accessory previews and 64 car preview files representing 19 model IDs. The vehicle reference contains 513 models total. Models without supplied previews are explicitly labelled; no unrelated image is substituted. The source `-1.png` accessory placeholder is not treated as an actual item.

Car names/brands/year are parsed as literals from `assets/CarShopInfo.js` using TypeScript's parser, without executing the game bundle. Skin/accessory names could not be reliably mapped to model IDs; those cards show ID only. The UI's example shop data is not a trusted catalog and is not imported as item names. File IDs are resource identifiers, not proof that an item is enabled on the live server.

To regenerate after reviewing a new resource version:

```
node scripts/import-wiki.mjs "<path to uiresources>"
npm run build
node --test tests/wiki.test.mjs
```

The importer copies small previews where present, otherwise original PNGs. Asset files are copied unchanged. Source launcher files are never modified. Review removed items when regenerating: older unreferenced copied files are not automatically deleted. Verify current rendered layout separately from automated catalog checks.

Local verification: TypeScript/Vite production build, six catalog tests, component-rendering checks and HTTP checks of the built catalog (`200 application/json`) and a preview (`200 image/png`). Automated checks cover every referenced image, all page-size choices, complete traversal without missing/duplicate entries, ID/model search and invalid URL parameters. A real-browser visual/interaction check is not completed: local browser control is disabled in Work settings. No commit, push or deployment was requested for this implementation.
