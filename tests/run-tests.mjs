import assert from "node:assert/strict";

import { validateTeamName, getVisibleLength } from "../js/validation.js";
import { sanitizeFileName, buildAdFileName, buildUniqueMediaName } from "../js/file-names.js";
import { createWritePlan, writeConfiguration } from "../js/configuration-writer.js";
import { verifyWriteResult } from "../js/configuration-verifier.js";
import { createMockRoot, fakeFile } from "./mock-fs.mjs";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL - ${name}`);
      console.error(error);
    }
  }

  console.log(`\n${passed} onnistui, ${failed} epäonnistui, ${tests.length} yhteensä.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

function fakeState(overrides = {}) {
  return {
    homeName: "HOKKARIT",
    guestName: "ILVES",
    homeLogo: { file: fakeFile("koti.png", 1000, "image/png") },
    guestLogo: { file: fakeFile("vieras.jpg", 2000, "image/jpeg") },
    ads: [],
    goalVideo: null,
    media: [],
    replaceExisting: true,
    ...overrides
  };
}

// --- Joukkueen nimi ---------------------------------------------------

test("tyhjä nimi hylätään", () => {
  assert.notEqual(validateTeamName(""), "");
});

test("8 merkkiä hyväksytään", () => {
  assert.equal(validateTeamName("ABCDEFGH"), "");
});

test("9 merkkiä hylätään", () => {
  assert.notEqual(validateTeamName("ABCDEFGHI"), "");
});

test("alun ja lopun välilyönnit poistetaan ennen pituuden tarkistusta", () => {
  assert.equal(validateTeamName("   ABCDEFGH   "), "");
});

test("ääkköset hyväksytään", () => {
  assert.equal(validateTeamName("ÄÖÅÄÖÅ"), "");
});

test("näkyvä pituus lasketaan Array.from(value).length -menetelmällä", () => {
  assert.equal(getVisibleLength("ÄÖÅ"), 3);
});

// --- Tiedostonimen sanitointi -------------------------------------------

test("välilyönnit muuttuvat alaviivoiksi", () => {
  assert.equal(sanitizeFileName("Yrityksen Mainos 2026.jpg"), "Yrityksen_Mainos_2026.jpg");
});

test("polkumerkit poistuvat", () => {
  const result = sanitizeFileName("a/b\\c.png");
  assert.ok(!result.includes("/"));
  assert.ok(!result.includes("\\"));
});

test("ongelmalliset merkit poistuvat", () => {
  const result = sanitizeFileName('a<b>c:d"e|f?g*h.png');
  assert.ok(!/[<>:"|?*]/.test(result));
});

test("ohjausmerkit poistuvat", () => {
  const result = sanitizeFileName("abc.txt");
  assert.equal(result, "abc.txt");
});

test("tiedostopääte säilyy", () => {
  assert.equal(sanitizeFileName("My File.MP4"), "My_File.MP4");
});

test("tyhjäksi muuttuva nimi saa varanimen", () => {
  assert.equal(sanitizeFileName("....jpg"), "tiedosto.jpg");
  assert.equal(sanitizeFileName("..."), "tiedosto");
});

test("samannimiset mediat saavat _2- ja _3-jälkiliitteet", () => {
  const used = new Set();
  const first = buildUniqueMediaName(used, "intro.mp4");
  const second = buildUniqueMediaName(used, "intro.mp4");
  const third = buildUniqueMediaName(used, "intro.mp4");

  assert.equal(first, "intro.mp4");
  assert.equal(second, "intro_2.mp4");
  assert.equal(third, "intro_3.mp4");
});

// --- Mainosten nimeäminen -------------------------------------------------

test("ensimmäinen mainos alkaa 01_", () => {
  assert.equal(buildAdFileName(1, "mainos.jpg"), "01_mainos.jpg");
});

test("toinen mainos alkaa 02_", () => {
  assert.equal(buildAdFileName(2, "mainos.jpg"), "02_mainos.jpg");
});

test("tiedostopääte säilyy mainoksen nimeämisessä", () => {
  assert.equal(buildAdFileName(3, "clip.MP4"), "03_clip.MP4");
});

test("tiedosto numero 100 saa toimivan numeroinnin", () => {
  assert.equal(buildAdFileName(100, "x.png"), "100_x.png");
});

test("järjestyksen muuttaminen muuttaa numerointia", () => {
  const state = fakeState({
    ads: [
      { file: fakeFile("toka.jpg", 10, "image/jpeg") },
      { file: fakeFile("eka.jpg", 10, "image/jpeg") }
    ]
  });

  const planBefore = createWritePlan(state);
  assert.equal(planBefore.ads[0].targetName, "01_toka.jpg");
  assert.equal(planBefore.ads[1].targetName, "02_eka.jpg");

  state.ads.reverse();

  const planAfter = createWritePlan(state);
  assert.equal(planAfter.ads[0].targetName, "01_eka.jpg");
  assert.equal(planAfter.ads[1].targetName, "02_toka.jpg");
});

// --- Hakemistorakenne (mock File System Access API) -----------------------

test("kaikki viisi alikansiota luodaan", async () => {
  const root = createMockRoot();
  const state = fakeState();
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const dsb = await root.getDirectoryHandle("dsbController");
  for (const name of ["ad", "goal", "guest", "home", "media"]) {
    const dir = await dsb.getDirectoryHandle(name);
    assert.ok(dir, `${name}-kansio puuttuu`);
  }
});

test("nimi.txt kirjoitetaan oikeaan kansioon oikealla sisällöllä", async () => {
  const root = createMockRoot();
  const state = fakeState({ homeName: "  HOKKARIT  ", guestName: "ILVES" });
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const dsb = await root.getDirectoryHandle("dsbController");
  const home = await dsb.getDirectoryHandle("home");
  const guest = await dsb.getDirectoryHandle("guest");

  const homeNameHandle = await home.getFileHandle("nimi.txt");
  const guestNameHandle = await guest.getFileHandle("nimi.txt");

  assert.equal(await (await homeNameHandle.getFile()).text(), "HOKKARIT");
  assert.equal(await (await guestNameHandle.getFile()).text(), "ILVES");
});

test("logot nimetään oikein tiedostopäätteen mukaan", async () => {
  const root = createMockRoot();
  const state = fakeState({
    homeLogo: { file: fakeFile("koti.PNG", 500, "image/png") },
    guestLogo: { file: fakeFile("vieras.jpeg", 700, "image/jpeg") }
  });
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const dsb = await root.getDirectoryHandle("dsbController");
  const home = await dsb.getDirectoryHandle("home");
  const guest = await dsb.getDirectoryHandle("guest");

  assert.equal((await (await home.getFileHandle("home.png")).getFile()).size, 500);
  assert.equal((await (await guest.getFileHandle("guest.jpg")).getFile()).size, 700);
});

test("goal.mp4 kirjoitetaan oikein alkuperäisestä nimestä riippumatta", async () => {
  const root = createMockRoot();
  const state = fakeState({
    goalVideo: { file: fakeFile("aivan_muu_nimi.mp4", 12345, "video/mp4") }
  });
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const dsb = await root.getDirectoryHandle("dsbController");
  const goal = await dsb.getDirectoryHandle("goal");
  const file = await (await goal.getFileHandle("goal.mp4")).getFile();

  assert.equal(file.size, 12345);
});

test("mainokset kirjoitetaan oikeassa järjestyksessä", async () => {
  const root = createMockRoot();
  const state = fakeState({
    ads: [
      { file: fakeFile("eka.jpg", 10, "image/jpeg") },
      { file: fakeFile("toka.mp4", 20, "video/mp4") }
    ]
  });
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const dsb = await root.getDirectoryHandle("dsbController");
  const ad = await dsb.getDirectoryHandle("ad");

  const first = await (await ad.getFileHandle("01_eka.jpg")).getFile();
  const second = await (await ad.getFileHandle("02_toka.mp4")).getFile();

  assert.equal(first.size, 10);
  assert.equal(second.size, 20);
});

test("media-tiedostot kirjoitetaan oikeilla nimillä", async () => {
  const root = createMockRoot();
  const state = fakeState({
    media: [
      { file: fakeFile("intro.mp4", 30, "video/mp4") },
      { file: fakeFile("intro.mp4", 40, "video/mp4") }
    ]
  });
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const dsb = await root.getDirectoryHandle("dsbController");
  const media = await dsb.getDirectoryHandle("media");

  const first = await (await media.getFileHandle("intro.mp4")).getFile();
  const second = await (await media.getFileHandle("intro_2.mp4")).getFile();

  assert.equal(first.size, 30);
  assert.equal(second.size, 40);
});

test("tyhjennys ei koske juurihakemiston muita tiedostoja", async () => {
  const root = createMockRoot();
  await root.getFileHandle("muistitikun_oma_tiedosto.txt", { create: true });

  const state = fakeState();
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const rootNames = [];
  for await (const [name] of root.entries()) {
    rootNames.push(name);
  }

  assert.ok(rootNames.includes("muistitikun_oma_tiedosto.txt"));
  assert.ok(rootNames.includes("dsbController"));
});

test("aiempi konfiguraatio korvataan hallituissa kansioissa", async () => {
  const root = createMockRoot();
  const dsb = await root.getDirectoryHandle("dsbController", { create: true });
  const ad = await dsb.getDirectoryHandle("ad", { create: true });
  await ad.getFileHandle("99_vanha_mainos.jpg", { create: true });

  const state = fakeState({
    ads: [{ file: fakeFile("uusi.jpg", 10, "image/jpeg") }]
  });
  const plan = createWritePlan(state);

  await writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} });

  const adAfter = await dsb.getDirectoryHandle("ad");
  const namesAfter = [];
  for await (const [name] of adAfter.entries()) {
    namesAfter.push(name);
  }

  assert.ok(!namesAfter.includes("99_vanha_mainos.jpg"));
  assert.ok(namesAfter.includes("01_uusi.jpg"));
});

test("yksittäinen tiedoston kirjoitusvirhe keskeyttää prosessin", async () => {
  const root = createMockRoot();
  const dsb = await root.getDirectoryHandle("dsbController", { create: true });
  const ad = await dsb.getDirectoryHandle("ad", { create: true });

  const originalGetFileHandle = ad.getFileHandle.bind(ad);
  ad.getFileHandle = async (name, options) => {
    if (name === "02_rikkinainen.mp4") {
      throw new Error("Levy on täynnä.");
    }
    return originalGetFileHandle(name, options);
  };

  const state = fakeState({
    ads: [
      { file: fakeFile("ehjä.jpg", 10, "image/jpeg") },
      { file: fakeFile("rikkinainen.mp4", 20, "video/mp4") }
    ]
  });
  const plan = createWritePlan(state);

  await assert.rejects(
    writeConfiguration(root, plan, { replaceExisting: true, onProgress: () => {} }),
    (error) => {
      assert.equal(error.filename, "02_rikkinainen.mp4");
      assert.match(error.message, /02_rikkinainen\.mp4/);
      return true;
    }
  );
});

test("onnistunut kirjoitus käynnistää tarkistuksen, joka havaitsee virheellisen sisällön", async () => {
  const root = createMockRoot();
  const dsb = await root.getDirectoryHandle("dsbController", { create: true });
  const home = await dsb.getDirectoryHandle("home", { create: true });
  const guest = await dsb.getDirectoryHandle("guest", { create: true });

  const homeNameHandle = await home.getFileHandle("nimi.txt", { create: true });
  const writable = await homeNameHandle.createWritable();
  await writable.write("VÄÄRÄ_NIMI");
  await writable.close();

  await guest.getFileHandle("guest.jpg", { create: true });
  await home.getFileHandle("home.png", { create: true });

  const plan = createWritePlan(fakeState());

  await assert.rejects(
    verifyWriteResult({ home, guest, goal: null }, plan)
  );
});

await run();
