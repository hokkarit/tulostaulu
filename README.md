# Videotulostaulun ottelukonfiguraatio

Selainpohjainen työkalu Jidoka-videotulostaulun ottelukohtaisen USB-konfiguraation luomiseen. Sovelluksella täytetään ottelun tiedot, valitaan joukkueiden logot, mainokset, maalivideo ja muut mediatiedostot, ja lopuksi kirjoitetaan valmis `dsbController`-kansiorakenne suoraan käyttäjän valitsemalle USB-muistitikulle.

Sovellus on staattinen sivusto, joka koostuu pelkästä HTML:stä, CSS:stä ja vanilla JavaScript-moduuleista. Mitään kehyksiä (React, Vue, Angular, Svelte) tai build-vaihetta ei käytetä.

## Tuetut selaimet

- **Suositus:** Google Chrome tai Microsoft Edge tietokoneella (Windows, macOS tai Linux).
- Sovellus käyttää File System Access API:a (`showDirectoryPicker`) suoraan USB-muistitikulle kirjoittamiseen. Tätä rajapintaa ei ole toteutettu Firefoxissa, Safarissa eikä iOS-selaimissa, joten niissä suoraa USB-kirjoitusta ei voi käyttää.
- Jos selain ei tue rajapintaa, sovellus näyttää siitä selkeän varoituksen eikä väitä tukea olevan olemassa.

## HTTPS- tai localhost-vaatimus

File System Access API toimii vain suojatussa kontekstissa: joko `https://`-osoitteesta tai `localhost`-osoitteesta. Pelkkä `index.html`-tiedoston avaaminen suoraan `file://`-osoitteesta ei toimi luotettavasti, koska selaimet rajoittavat ES-moduulien lataamista `file://`-protokollasta.

## Paikallinen käynnistys

ES-moduulit eivät välttämättä toimi avaamalla `index.html` suoraan tiedostojärjestelmästä. Käynnistä sen sijaan yksinkertainen paikallinen HTTP-palvelin projektin juuressa, esimerkiksi Pythonilla:

```
python3 -m http.server 8000
```

Avaa sen jälkeen selaimessa osoite:

```
http://localhost:8000
```

Sovellus ei vaadi `npm install`-komentoa eikä Node.js:ää käyttöä varten. Node.js:ää tarvitaan ainoastaan valinnaisten automaattitestien ajamiseen.

## Logotietokanta (valinnainen pikatäyttö)

Sovellus sisältää valmiin joukkuelogojen "tietokannan". Koti- ja vierasjoukkueen nimikenttä on tavallinen tekstikenttä, jossa on selaimen oma automaattitäydennys (HTML `<datalist>`) — ei erillistä pudotusvalikkoa:

- **`teams.json`** projektin juuressa listaa tunnetut joukkueet kolmella kentällä per joukkue: `nimi` (koko/virallinen nimi, jolla logotiedosto haetaan), `lyhytNimi` (enintään 8 merkkiä, joka päätyy lopulliseen nimikenttään) ja valinnainen `paikkakunta` (kotipaikkakunta, hakukenttä lisänä):
  ```json
  { "teams": [
    { "nimi": "Kisa Eagles", "lyhytNimi": "KisaE", "paikkakunta": "Kangasala" },
    { "nimi": "Hokkarit", "lyhytNimi": "Hokkarit", "paikkakunta": "Hämeenkyrö" }
  ] }
  ```
- **`images/logos/`**-kansiossa on kutakin `nimi`-kenttää vastaava logotiedosto muodossa `<nimi>.png`, `.jpg` tai `.jpeg` (nimen pitää täsmätä tarkalleen, isot/pienet kirjaimet ja välilyönnit mukaan lukien).
- Kun nimikenttään kirjoittaa tai automaattitäydennyksestä valitsee tunnetun joukkueen (koko nimen, lyhyen nimen **tai paikkakunnan** perusteella), sovellus täyttää kentän automaattisesti oikealla **lyhyellä nimellä** ja hakee (`fetch`) vastaavan logotiedoston, kokeillen päätteitä järjestyksessä `.png`, `.jpg`, `.jpeg` — täysin samalla tavalla kuin käsin ladattu tiedosto (sama validointi, ei muokkausta kuvaan). Paikkakunnalla haku näyttää ehdotuksia (esim. "Tampere" löytää sekä Ilveksen, Koo Veen että Tapparan), mutta ei koskaan täytä kenttää automaattisesti pelkän paikkakunnan perusteella, koska sama paikkakunta voi täsmätä useaan joukkueeseen — käyttäjä valitsee aina itse oikean rivin ehdotuslistasta.
- Jos kirjoitettu nimi ei täsmää mihinkään tunnettuun joukkueeseen, kenttä toimii tavallisena vapaana tekstikenttänä ("luo uusi") eikä mitään haeta automaattisesti — logon voi tällöin valita käsin tavalliseen tapaan.
- Jos logoa ei löydy tunnistetulle joukkueelle, näytetään siitä huomautus nimikentän alla, mutta nimi jää silti täytetyksi.
- Kotijoukkueen kenttä täyttyy sivun latautuessa automaattisesti joukkueella **"Hokkarit"** (`nimi`-kentän perusteella), jos se löytyy `teams.json`-listasta. Jos `teams.json`-tiedostoa ei löydy tai se on virheellinen, sovellus käyttää oletuksena pelkkää listaa `[{"nimi": "Hokkarit", "lyhytNimi": "Hokkarit"}]`.
- Tietokanta on aina vain **valinnainen pikatäyttö** — kaikki kentät voi täyttää ja logon voi ladata myös täysin käsin, eikä `teams.json`- tai `images/logos/`-tiedostoja tarvita sovelluksen perustoiminnan kannalta.

Uuden joukkueen lisääminen tietokantaan:

1. Tallenna logotiedosto kansioon `images/logos/` nimellä `<nimi>.png` (tai `.jpg`/`.jpeg`), missä `<nimi>` on sama kuin `teams.json`-tiedoston `nimi`-kenttä.
2. Lisää joukkue `teams.json`-tiedoston `teams`-listaan kentillä `nimi` ja `lyhytNimi` (`lyhytNimi` enintään 8 merkkiä).
3. Julkaise sivusto uudelleen (tai lataa se paikallisesti uudelleen) — mitään build-vaihetta ei tarvita.

Huomaa: `lyhytNimi`-kentän pituusraja (enintään 8 näkyvää merkkiä) on sovelluksen kova vaatimus. Jos se on määritelty liian pitkäksi (tai puuttuu, jolloin oletuksena käytetään koko `nimi`-kenttää), kirjoituspainike pysyy pois käytöstä kunnes nimeä lyhentää käsin.

## Käyttöohje

1. Täytä kotijoukkueen ja vierasjoukkueen nimet (enintään 8 merkkiä kumpikin) sekä valitse molempien logot (PNG, JPG tai JPEG) — joko käsin tai yllä kuvatusta logotietokannasta.
2. Lisää tarvittaessa mainostiedostoja (PNG, JPG, JPEG tai MP4). Voit lisätä useita kerralla, poistaa yksittäisiä tiedostoja ja järjestää niitä joko ylös/alas-painikkeilla tai raahaamalla tiedoston kahvasta (⠿) uuteen kohtaan listassa. Mainokset nimetään automaattisesti kirjoitushetkellä järjestysnumerolla (`01_`, `02_`, ...). Kuva-, video- ja äänitiedostoista näytetään aito, äänellinen esikatselu suoraan listassa, jotta oikea tiedosto on helppo tunnistaa.
3. Valitse tarvittaessa yksi maalivideo (vain MP4). Video tallennetaan aina nimellä `goal.mp4`. Jos maalivideo on jo valittu, uuden tiedoston valitseminen (raahaamalla tai tiedostovalitsimella) pyytää ensin vahvistuksen korvaamisesta.
4. Lisää tarvittaessa muita mediatiedostoja (MP4, PNG, JPG, JPEG, MP3 tai WAV). Alkuperäinen tiedostonimi säilytetään sanitoituna; samannimiset tiedostot saavat juoksevan numeron. Myös nämä voi järjestää raahaamalla.
5. Valitse, korvataanko aiempi konfiguraatio (oletuksena päällä). Tämä tyhjentää ennen kirjoitusta kansiot `ad`, `goal`, `guest`, `home` ja `media` — ei mitään muuta USB-muistitikulta.
6. Tarkista tallennettavan hakemistorakenteen esikatselu ja yhteenveto.
7. Paina "Valitse USB-muistitikku ja kirjoita tiedostot", vahvista dialogissa ja valitse **USB-muistitikun juurihakemisto** (älä valitse valmiiksi `dsbController`-kansiota).
8. Odota kirjoituksen valmistumista ja lue onnistumis- tai virheilmoitus.
9. Odota vielä hetki onnistuneen kirjoituksen jälkeen ja poista muistitikku sitten hallitusti käyttöjärjestelmän omalla Poista laite- tai Eject-toiminnolla. Sovellus ei tee eikä lupaa tehdä tätä puolestasi.

## Tietoturva ja tietosuoja

- Kaikki tiedostojen käsittely tapahtuu paikallisesti selaimessa. Mitään tiedostoja, tiedostonimiä tai muita tietoja ei lähetetä verkkoon eikä mihinkään ulkopuoliseen palveluun.
- Sovelluksessa ei ole analytiikkaa eikä seurantaa.
- Sovellus kirjoittaa vain siihen kansioon, jonka käyttäjä itse valitsee hakemistovalitsimesta.
- **Turvallisuusrajoitus:** kun "Korvaa aiempi ottelukonfiguraatio" on valittuna, sovellus tyhjentää ainoastaan `dsbController`-kansion hallitut alikansiot (`ad`, `goal`, `guest`, `home`, `media`). Se ei koskaan poista `dsbController`-kansiota itseään eikä mitään sen ulkopuolella olevaa USB-muistitikun sisältöä.
- Sovellus muistaa selaimen `localStorage`:ssa **vain tekstitietoa** nopeuttaakseen toistuvaa käyttöä: kotijoukkueen nimen, "Korvaa aiempi ottelukonfiguraatio" -asetuksen sekä viimeksi käytettyjen mainostiedostojen nimijärjestyksen. Yhtään tiedoston sisältöä (kuvia, videoita) ei koskaan tallenneta `localStorage`:en.
- Sovellus muistaa lisäksi **mainokset, maalivideon ja muut mediatiedostot itse** selaimen `IndexedDB`-tallennustilaan, jotta niitä ei tarvitse valita uudelleen joka kerta. Kaikki tämä pysyy edelleen täysin paikallisena selaimessa — mitään ei lähetetä minnekään. Kun sivu avataan uudelleen ja palautettua mediaa löytyy, siitä näytetään selkeä ilmoitus ("Palautettu edellisestä käyttökerrasta: ...") ja "Hylkää muistista palautettu media" -painike, jolla palautetun median voi poistaa erikseen. "Luo uusi konfiguraatio" -painike tyhjentää sekä lomakkeen, `localStorage`-tekstitiedot että tämän `IndexedDB`-mediamuistin kokonaan.
- Selaimet voivat tyhjentää `IndexedDB`-tallennustilan ilman varoitusta esimerkiksi levytilan loppuessa tai yksityisessä selauksessa — sovellus pyytää selaimelta pysyvämpää tallennustilaa (`navigator.storage.persist()`), mutta tätä ei voi taata jokaisessa tilanteessa.

## Ennen ottelupäivää

- Testaa sovellus ensin tyhjällä, varmuuskopioimattomilla tiedostoilla varustetulla USB-muistitikulla, ei suoraan ottelupäivän tikulla.
- Kokeile luotua konfiguraatiota videotulostaululla hyvissä ajoin ennen ottelua, jotta mahdollisiin ongelmiin jää aikaa reagoida.

## Testit

Projektissa on kevyt Node.js-pohjainen testisarja puhtaille apufunktioille (nimien validointi, tiedostonimien sanitointi, mainosten nimeäminen) sekä File System Access API:n mock-kahvoilla tehty integraatiotesti kirjoitusprosessille. Testit eivät vaadi `npm install`-komentoa eivätkä riipu selaimesta.

Aja testit projektin juuresta:

```
node tests/run-tests.mjs
```

## Julkaisu GitHub Pagesiin

1. Vie projektin tiedostot GitHub-repositorion juureen (tai `docs/`-kansioon, jos käytät sitä GitHub Pagesin lähteenä).
2. Avaa repositoriossa **Settings → Pages**.
3. Valitse julkaisulähteeksi haluamasi haara (esim. `main`) ja kansio (`/` tai `/docs`).
4. Tallenna. GitHub julkaisee sivuston automaattisesti HTTPS-osoitteeseen, jolloin File System Access API toimii tuetuissa selaimissa (Chrome/Edge, tietokone).

Koska sovellus on täysin staattinen eikä tarvitse build-vaihetta, mitään erillistä julkaisuputkea ei tarvita.

Projektin juuressa oleva `CNAME`-tiedosto ohjaa sovelluksen mukautettuun verkkotunnukseen `tulostaulu.hokkarit.fi`. Jos DNS-osoitin (CNAME-tietue) on asetettu tähän GitHub Pages -sivustoon, sivusto aukeaa myös tästä osoitteesta HTTPS:n yli.
