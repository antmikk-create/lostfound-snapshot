# TODO - Lostfound snapshot build -korjaukset

## Vaihe 1: Conflict-markerit pois
- [ ] Poista `<<<<<<< HEAD` / `>>>>>>> ...` markerit tiedostosta `scripts/build-snapshot.js`
- [ ] Poista mahdolliset markerit tiedostosta `public/css/styles.css`
- [ ] Poista mahdolliset markerit tiedostosta `templates/index.html`

## Vaihe 2: LOST/FOUND data ja suodatus snapshotissa
- [ ] Varmista, että `type` lasketaan oikein (FOUND/LOST) jokaiselle itemille `scripts/build-snapshot.js`
- [ ] Lisää `type` myös `dist/data.json`-tiedostoon
- [ ] Lisää snapshotin item-kortteihin data-attribute: `data-type`
- [ ] Lisää etusivulle UI: select/radiovalinta “Löytyneet / Kadonneet”
- [ ] Lisää frontin JS-skriptin suodatuslogiikka type-suodattimelle

## Vaihe 3: Etusivun teksti
- [ ] Päivitä header/tekstit kertomaan, että kadonneet/löydetyt vaihdetaan samalla sivulla

## Vaihe 4: Build ja validointi
- [ ] Suorita `npm run build`
- [ ] Tarkista että `dist/index.html` sisältää type-suodattimen ja että data.json sisältää `type`
- [ ] Tarkista selaimessa että “Löytyneet” ja “Kadonneet” näyttävät eri itemjoukot

