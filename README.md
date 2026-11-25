# LQS-werkplek

Werkplek voor het uitvoeren van Locatie QuickScans (LQS) voor middenspanningsstations: van zoekgebied tot onderbouwd adviesrapport, met portfoliobewaking op de doorlooptijd van drie weken.

## Starten

```bash
npm install
npm run dev        # http://localhost:3000
```

Zonder configuratie draait de app op een lokale Postgres (PGlite) in `.data/`. Zet `DATABASE_URL` (Neon) om een gedeelde database te gebruiken; de tabel wordt bij de eerste aanroep aangemaakt. Op Vercel is `DATABASE_URL` verplicht, want `.data/` blijft daar niet bewaard.

## Demo geven

Dubbelklik op `start-demo.command` in de projectmap. Het script bouwt de app, start hem op http://localhost:3210 en opent de browser; sluit het Terminal-venster om te stoppen. Tijdens de demo is internet nodig: kaarten en luchtfoto's komen live van PDOK.

**Demo's.** De repository bevat acht uitgewerkte demo-LQS'en in `demo/demo-data.json.gz`. Een lege database wordt er bij de eerste start mee gevuld, dus op een andere laptop is `git clone`, `npm install` en starten genoeg; de map `.data` hoeft niet mee. Ontbreken er demo's, kies dan op de portfoliopagina "Demo-LQS… → Meegeleverde demo's terugzetten".

| Demo | Gebied | Station | Fase |
| --- | --- | --- | --- |
| Zwolle Stadshagen | Enexis | TVS 21 velden | Opgeleverd |
| Assen Kloosterveen | Enexis | TVS 20 velden | Review |
| Groningen Hoogkerk | Enexis | TVS 23 velden | Rapport |
| Tilburg Reeshof | Enexis | TVS 21 velden | Opgeleverd |
| Venlo Blerick | Enexis | TVS 19 velden | Review |
| Spannenburg | Liander | TVS 20 velden | Rapport |
| Akkrum | Liander | TVS 21 velden | Review |
| Wolvega | Liander | TVS 23 velden | Opgeleverd |

Elke demo is een zoekcirkel van 250 m aan de rand van een wijk, dorp of bedrijventerrein, met een aansluitpunt, een door de gemeente aangedragen locatie, gesimuleerde KLIC-leidingen, vijf locaties uit de analyse en een ingevuld dossier van planoloog en reviewer. Echt zijn de analyse op openbare bronnen en de plaatsing van de kavels. Verzonnen zijn de zoekcirkel, het aansluitpunt, de aangedragen locatie, de KLIC-leidingen en alles wat planoloog, AI-voorstel en reviewer invullen (namen, projectnummers, eigendom, scores). De scenario's staan in `src/lib/demoScenarios.ts`.

Een demo opnieuw doorrekenen: kies hem in "Demo-LQS…"; een demo die al bestaat wordt bijgewerkt, niet dubbel aangemaakt. Daarna de meegeleverde data verversen met `npm run demodata` (de app moet draaien) en het bestand committen. De template is van Enexis; de drie demo's in Friesland gebruiken dezelfde template met Liander als netbeheerder in de teksten van de demo.

## Werkwijze in de app

1. **Opdracht** – zoekgebied tekenen of als GeoJSON (EPSG:4326) laden, type station en kavelmaat, optioneel het aansluitpunt en vooraf aangedragen locaties.
2. **Analyse** – haalt de kaartlagen op, sluit ongeschikte delen uit (met buffer per laag), past de kavel in en kiest maximaal zes gespreide, kansrijke locaties. Per laag is in te stellen: uitsluiten, aandacht of niet meenemen. Eigen lagen (geodata Enexis, KLIC-levering) zijn als GeoJSON toe te voegen, in RD of WGS84. Een laag met de rol "net van Enexis" bepaalt het criterium nettechniek (afstand tot het net) en levert per locatie de ligging van kabels ten opzichte van de kavel.
3. **Locaties** – tien criteria worden automatisch gescoord, vijf door de planoloog (omgevingsplan, eigendom, inpassing, KLIC, procedure). Gewogen totaalscore 0–100, voorkeurslocatie met motivatie. Met "AI-voorstel ophalen" haalt de app per locatie bestemming, dubbelbestemming, kadastraal perceel en grondgebruik op en doet Claude een voorstel per handmatig criterium, met zekerheid en een controlepunt. Zolang de eigendomsinformatie van het Kadaster er niet is, schat het voorstel het soort eigenaar in uit perceelkenmerken (bebouwing en gebruik volgens BAG, vorm, grootte, bestemming, aandeel van de kavel), met lage zekerheid. Per perceel is de eigenaar uit Kadaster-informatie vast te leggen; dan weegt het type eigenaar mee, de naam gaat niet naar het model. Een voorstel telt pas mee nadat de planoloog het overneemt; overgenomen voorstellen zijn in het rapport gemarkeerd.
4. **Rapport** – levert het rapport in de standaardtemplate LQS van Enexis (liggend A4): omslag, colofon, inleiding, projectpaspoort, ruimtelijke context met een kaart per thema, kansrijke gebieden, één pagina per locatie (A t/m F), overzicht en advies. De velden per locatie vul je in op de tab Locaties onder "Template Enexis"; wat de app uit analyse en openbare bronnen kan afleiden staat er al (grijs) en is te overschrijven. Het werkrapport in eigen opmaak (scores, lagentabel) blijft beschikbaar als onderbouwing.
5. **Review** – vier-ogencontrole met vaste controlepunten; pas daarna opleveren.

## Kabeltracé, 3D-beeld en meekijkportaal

- **Kabeltracé met kostenindicatie** – de analyse bepaalt per locatie de goedkoopste route naar het aansluitpunt (of, zonder aansluitpunt, naar het aangeleverde net van Enexis): bij voorkeur langs de openbare weg, water en spoor met een boring, bebouwing wordt gemeden. Lengte en kosten staan bij de locatie, op de kaart en in het rapport, en het criterium nettechniek rekent met de tracélengte in plaats van de hemelsbrede afstand. Een aansluitpunt tot 1,5 km buiten het zoekgebied valt binnen het rekengebied. De kengetallen per meter staan in `TRACE` in `src/lib/config.ts`.
- **3D-beeld** – de knop "3D-beeld" bij een locatie toont het station op schaal op de luchtfoto, tussen de bestaande bebouwing met hoogtes uit 3DBAG. De poort staat aan de kant waar het kabeltracé de kavel verlaat. Het aanzicht is vast te leggen voor het rapport en als afbeelding op te slaan. Gebouwmaten per stationstype staan in `STATION_TYPEN` in `src/lib/config.ts`.
- **Meekijkportaal** – op de portfoliopagina maak je met "Meekijklink opdrachtgever" een link voor de planoloog van Enexis. Die ziet alle lopende en opgeleverde LQS'en met fase, planning en doorlooptijd, en vanaf de rapportfase de locaties met score, kabeltracé en 3D-beeld. Alleen lezen; aangeleverde geodata, namen van eigenaren en AI-voorstellen zijn niet zichtbaar. Een nieuwe link maakt de oude ongeldig.

## AI-voorstel instellen

Zet de sleutel in `.env.local` en herstart de app:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Zonder sleutel haalt de knop alleen de feiten op. Naar het model gaan uitsluitend openbare feiten en analyse-uitkomsten (afstanden, bestemming, perceelaanduiding, adres). Aangeleverde geodata en de namen van vertrouwelijke lagen gaan niet mee. De prompt en het model staan in `src/lib/ai.ts`.

## KLIC

Er zijn twee routes, die allebei eindigen in dezelfde levering-zip van het Kadaster.

**Handmatig.** Vraag de gebiedsinformatie op via Mijn Kadaster en lees de levering-zip in op het tabblad Analyse. De leidingen komen per thema als kaartlaag bij de LQS. Gas hoge druk, hoogspanning, buisleidingen met gevaarlijke inhoud en (petro)chemie sluiten een locatie uit met een strook van 5 m (aanname); de overige thema's zijn een aandachtspunt. Netbeheerders die niets hebben aangeleverd worden gemeld. Getest met de voorbeeldlevering van het Kadaster (IMKL 2.0).

**Automatisch.** De app dient een oriëntatieverzoek in via de KLIC B2B REST API, volgt de status en leest de levering in. Deze route is gebouwd naar de documentatie van het Kadaster (github.com/kadaster/klic-win) en is **niet getest**: er was geen client-id en geen certificaat beschikbaar. Test eerst op de testomgeving. Benodigd in `.env.local`:

```
KLIC_OMGEVING=test                      # of productie
KLIC_CLIENT_ID=...                      # aanvragen via formulieren.kadaster.nl/klic-oauth
KLIC_PRIVATE_KEY_FILE=/pad/naar/key.pem # privésleutel van het PKIoverheid-certificaat
KLIC_KEY_ID=...                         # kid van de sleutel
KLIC_AANVRAGER_JSON={"contactpersoon":{"naam":"...","telefoon":"...","email":"..."},"organisatie":{"naam":["..."],"kvkNummer":"...","bezoekAdres":{"BAGid":"...","openbareRuimteNaam":"...","huisnummer":"...","woonplaatsNaam":"...","postcode":"...","landcode":"http://publications.europa.eu/resource/authority/country/NLD"},"relatienummer":"0000000000"}}
```

Het Kadaster werkt niet met een client-secret maar met een ondertekende aanmelding; daarvoor is een PKIoverheid-certificaat nodig. Een oriëntatieverzoek mag hooguit 2500 × 2500 m en 50 hoekpunten zijn. In productie is elke aanvraag een bestelling; de app vraagt daarom per aanvraag om bevestiging. De code staat in `src/lib/klic/`.

## Bronnen

| Laag | Bron |
| --- | --- |
| Bebouwing, woningen | BAG (PDOK WFS) |
| Water, wegen, spoor, bos | BRT TOP10NL (PDOK OGC API) |
| Natura 2000 | RVO (PDOK WFS) |
| Rijksmonumenten, archeologie | RCE (WFS) |
| Bestemming, dubbelbestemming (per locatie) | Ruimtelijke plannen (PDOK WMS); stand van vóór de Omgevingswet |
| Kadastraal perceel (per locatie) en perceelgrenzen (plaatsing) | Kadastrale kaart (PDOK WMS en WFS); zonder eigenaar |
| Begraafplaatsen, sportvelden, volkstuinen | BRT TOP10NL, functioneel gebied (PDOK OGC API) |
| Gebouwhoogtes (3D-beeld) | 3DBAG (TU Delft, op basis van BAG en AHN); bij uitval BAG met geschatte hoogte |
| Ondergronden | BRT-achtergrondkaart, luchtfoto, kadastrale kaart, bestemmingen (PDOK) |

Valt een bron uit, dan loopt de analyse door en staat de laag als "niet beschikbaar" in scherm en rapport.

## Uitgangspunten en beperkingen

- Stationstypen in `src/lib/config.ts` volgen de openbare voorlichting van Enexis: TVS (template LQS: perceel 20,3 × 17,7 m, gebouw 14,5 × 3,7 m; TVS met 20 velden volgens de flyer van juni 2024: gebouw 14,5 × 3,7 m, 3,7 m hoog, kelder 2,2 m, ruimtebeslag 222 m², waarbij de verdeling 18,5 × 12 m een afgeleide aanname is; daarnaast 19 en 23 velden volgens de menukaart van april 2024) en TVRS2/TVRS3 (folder Regelstation, LQS Lieshout juli 2025). Het zijn voorlichtingsmaten, geen ontwerpkader. De kavelverdeling 40 × 38 m van de TVRS2 is niet uit de bron zelf bevestigd. Bij een TVRS geldt 50 m afstand tot woningen (VNG-richtafstand), bij een TVS 10 m. Criteria, gewichten, reviewpunten en rapportsecties staan in hetzelfde bestand.
- Uit het programma van eisen van Enexis voor een TVS (menukaart april 2024) en de LQS Lieshout zijn automatisch verwerkt: afstand tot woningen, scholen en zorg (hinderlaag), afstand tot een kruising (criterium), vlak terrein op basis van het AHN en hoogwaterrisico volgens de Richtlijn Overstromingsrisico's (criterium), en 5 m afstand tot bos vanwege wortels. Niet automatisch te toetsen en daarom een reviewpunt: vrije hoogte en draagkracht van de toegangsweg, obstakels boven het station, vrije kabelruimte aan de voorzijde en de draagkracht van de ondergrond. Het natuurnetwerk (NNN), beschermde stads- en dorpsgezichten en de bodemkaart zijn niet als open dienst gevonden of gaven geen bruikbaar antwoord.
- Het 3D-model is nagetekend op basis van die maten en de beschrijving van het uiterlijk. Het 3D-beeld heeft twee stijlen: realistisch (three.js op een eigen canvas boven de kaart: materialen met textuur, zonlicht en slagschaduw; `src/lib/realistisch3d.ts`) en schematisch (egale blokken). De zonnestand is gekozen op een leesbaar beeld, niet op datum en tijd. Foto's en tekeningen van Enexis zijn niet overgenomen (alle rechten voorbehouden); de app linkt naar de folders van Enexis.
- Het rapport volgt de standaardtemplate van Enexis (`src/app/lqs/[id]/sjabloon/`, velden en afleiding in `src/lib/sjabloon.ts`, beeldmateriaal uit de template in `public/sjabloon/`). De keuzelijsten achter "Kies een item." staan niet in de pdf van de template; de lijsten in `sjabloon.ts` zijn aannames en de velden zijn vrij invulbaar. Vervang ze door de lijsten uit het bronbestand van Enexis.
- Street Smart (Cyclomedia): de koppeling is voorbereid maar niet getest, omdat er nog geen account en API-sleutel is. Zet `STREETSMART_API_KEY` en `STREETSMART_CLIENT_ID` (OAuth, aanbevolen) of `STREETSMART_USERNAME` en `STREETSMART_PASSWORD` in `.env.local`; zie `src/lib/streetsmart.ts`. De knop "Street Smart" bij een locatie opent het panorama en kan het beeld vastleggen als Streetview-foto voor de template. Voor OAuth zijn nog twee terugkeerpagina's nodig (`public/streetsmart/login.html` en `logout.html`) volgens de aanwijzingen van Cyclomedia.
- Plaatsing van de locaties (`src/lib/analyse/analyse.ts`). De analyse zoekt plekken zoals een verdeelstation in het MS-net doorgaans staat: bij de bebouwing die het voedt, aan een rijweg, dicht bij de liggende MS-kabels en op een klein stuk grond aan de rand van een perceel (groenstrook, berm, hoek van een terrein). Dat is verwerkt in drie criteria (ligging bij de bebouwde omgeving, afstand tot liggende MS-kabels, ligging aan de rand van het perceel) en in de plaatsing zelf: alleen plekken binnen 50 m van een rijweg (voet- en fietspaden tellen niet), daarna schuift elke locatie binnen 100 m naar de plek met het kortste kabeltracé, dicht bij de MS-kabels, aan de perceelrand, binnen één kadastraal perceel en zonder kabels van derden onder de kavel. Daarna schuift de kavel met de voorzijde tegen de weg (tot 6 m uit de wegas), maar hij stopt 2 m vóór kabels en leidingen van derden en zodra hij een extra kadastraal perceel zou raken. Minimaal 5 m tot uitgesloten gebied. Midden op een perceel groter dan 2 ha scoort het laagst. Vrije ruimte rond de kavel telt tot 10 m en zonder de weg; meer levert geen extra punten op. Of er leidingen in de kavel liggen wordt bepaald met de gedraaide kavel zelf. Begraafplaatsen, sportvelden en volkstuinen zijn uitgesloten. Deze uitgangspunten zijn gangbare praktijk en eigen aannames, geen ontwerpkader van een netbeheerder; de drempels staan in de code en de gewichten in `src/lib/config.ts`. Zonder KLIC of net van de netbeheerder krijgt het MS-criterium een neutrale 3.
- KLIC in de demo's is gesimuleerd (`src/lib/klic/simuleer.ts`): leidingen op vaste afstand langs de echte wegen, met aansluitleidingen naar de percelen. Middenspanning ligt alleen langs strengen: de kortste routes over de weg van het aansluitpunt naar de randen van het gebied. In een deel van de gebieden kruist een fictieve hogedrukgasleiding de rand van het zoekgebied. De lagen en het KLIC-paneel vermelden "gesimuleerd". De kaart toont KLIC als aparte laag (knop KLIC) met legenda; een klik op een leiding toont beheerder, type, materiaal, diepte en aanlegjaar.
- Streetview en KLIC per locatie: upload een foto of uitsnede op de tab Locaties. Zonder upload toont de template een luchtfoto van dichtbij en de kadastrale kaart, met de vermelding dat het beeld nog ontbreekt. Met `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `.env.local` haalt de template de Streetview-foto op via de Street View Static API (niet getest: er was geen sleutel).
- De demo's doorlopen analyse en feiten en vullen de template volledig. Eigendom, planregels, stikstofberekening, overstromingsrisico, bermbreedte, inpassing, review en colofon zijn daarin fictieve voorbeeldwaarden (`src/lib/demoInvulling.ts`, `src/lib/demoUitwerking.ts`). De bestemmingendienst van PDOK valt soms uit; `npm run demodata` weigert daarom demo's te bewaren waarbij een bron ontbrak.
- De analyse rekent op een raster van 2 tot 15 m in RD. De groene inpasruimte op de kaart is bepaald met een niet-gedraaide kavel; de kavel van elke kandidaat wordt daarna met de lange zijde evenwijdig aan de dichtstbijzijnde rijweg gelegd (voorzijde naar de weg), of in lijn met de bebouwing als er binnen 150 m geen weg is. Past de gedraaide kavel niet, dan schuift hij hooguit 8 m of blijft hij ongedraaid. Afstanden zijn hemelsbreed.
- Eigenaar en KLIC zijn niet openbaar; het AI-voorstel geeft daar een controle-instructie in plaats van een score. NNN, waterkeringen, buisleidingen en hoogspanning zitten niet in de uitsluitingsanalyse, tenzij als eigen laag geladen.
- De kengetallen voor het kabeltracé (€ 175, € 125 en € 500 per meter) zijn aannames. Het tracé houdt geen rekening met bestaande kabels en leidingen en is een indicatie voor de onderlinge vergelijking, geen ontwerp.
- Het 3D-beeld is een volumemodel: kavel, gebouw en hekwerk kloppen in maat, gevels en beplanting zijn indicatief.
- Het meekijkportaal werkt met een geheime link, zonder inlog. Laat bij invoering van Clerk de paden `/meekijken`, `/api/meekijken` en `/api/omgeving` openbaar en zet de rest achter de inlog.
- Er is nog geen inlog. Voeg authenticatie (Clerk) toe voordat de app buiten de eigen machine draait of vertrouwelijke data bevat.

## Opbouw

- `src/lib/analyse/` – rastermotor (`raster.ts`), bronnen (`bronnen.ts`), analyse en kandidaatselectie (`analyse.ts`)
- `src/lib/teksten.ts` – concepttekst voor het rapport
- `src/lib/db/`, `src/lib/repo.ts` – Drizzle-schema en opslag; `db/index.ts` laadt de meegeleverde demo's in een lege database
- `src/app/api/demo/`, `src/lib/demoScenarios.ts`, `src/lib/demoInvulling.ts`, `src/lib/demoUitwerking.ts`, `scripts/demodata.mjs`, `demo/` – demo's
- `src/app/api/` – routes; `src/app/lqs/[id]/` – werkplek en rapport
- `src/lib/analyse/trace.ts` – kabeltracé (goedkoopste route over het raster) en kostenindicatie
- `src/lib/station3d.ts`, `src/components/Kaart3D.tsx`, `src/app/api/omgeving/` – 3D-model van het station en de omliggende bebouwing
- `src/app/meekijken/`, `src/app/api/meekijken/`, `src/app/api/portaal/` – meekijkportaal en beheer van de link
- `src/components/Kaart.tsx` – MapLibre-kaart (worker wordt bij `npm install` naar `public/maplibre` gekopieerd)
