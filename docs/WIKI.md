# Wiki catalog

`/wiki` is a React view with skins, cars and accessories, ID/name search, 10/50/100 items per page and URL-backed pagination (`tab`, `size`, `page`, `q`). Browser Back/Forward restores selection. Previews are local static files; no game database or third-party CDN is required.

Imported from the operator-provided `uiresources` folder: 740 skin previews (including four variants), 693 accessory previews and 64 car preview files representing 19 model IDs. Additional static resolution found 178 car mappings: 38 prize images, 128 carsharing colors/views and 12 visually reviewed Battle Pass/main-menu reward images. The catalog now has 519 IDs (513 from the vehicle reference plus six additional image-only IDs), with previews for 75 models and 242 PNG files including variants. The remaining 444 catalog IDs have no confirmed preview in the reviewed image mappings. `public/wiki/car-sources.json` records the additional ID-to-resource-path mappings. Models without supplied previews are explicitly labelled; no unrelated image is substituted. The source `-1.png` accessory placeholder is not treated as an actual item.

Expanded search also examined all UI bundle image-path tables, numeric prize images, non-UI raster directories and the `connect/obnova.zip` file list. The archive contained no additional installed-missing car PNG/module candidate (the only missing listed UI image was a GPS cursor). The six newly discovered image-only vehicle IDs are 15661, 15688, 17426, 17454, 17456 and 17460; these do not receive fabricated names or years. Unrelated football-team badge IDs were explicitly excluded.

Car names/brands/year are parsed as literals from `assets/CarShopInfo.js` using TypeScript's parser, without executing the game bundle. Skin/accessory names could not be reliably mapped to model IDs; those cards show ID only. The UI's example shop data is not a trusted catalog and is not imported as item names. File IDs are resource identifiers, not proof that an item is enabled on the live server.

To regenerate after reviewing a new resource version:

```
node scripts/import-wiki.mjs "<path to uiresources>"
npm run build
node --test tests/wiki.test.mjs
```

The importer uses full-size car images and small skin/accessory previews where present. Asset bytes are copied unchanged. Additional car images are resolved statically from ES module imports/exports and literal URL/base64 bindings; source JavaScript is never executed. Source launcher files are never modified. Review removed items when regenerating: older unreferenced copied files are not automatically deleted. Verify current rendered layout separately from automated catalog checks.

The local vehicle name/year reference is not a verified live-server model list. Visual spot-checks found a discrepancy: the client image explicitly assigned to ID 419 depicts a Ford-branded hatchback while `CarShopInfo.js` calls that ID Opel Astra GTC. Do not claim every reference name matches the current model. A current server model/name mapping is needed to reconcile these labels reliably; names are not guessed from unrelated images.

Local verification: TypeScript/Vite production build, six catalog tests, component-rendering checks and HTTP checks of the built catalog (`200 application/json`) and a preview (`200 image/png`). Automated checks cover every referenced image, all page-size choices, complete traversal without missing/duplicate entries, ID/model search and invalid URL parameters. A real-browser visual/interaction check is not completed: local browser control is disabled in Work settings. No commit, push or deployment was requested for this implementation.
