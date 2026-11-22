// Koppeling met Street Smart van Cyclomedia (panoramabeelden op straatniveau), voorbereid en NIET getest: er is nog geen
// account en geen API-sleutel. Gebouwd naar de documentatie van de Street Smart API, versie 26.4
// (docs.cyclomedia.com/StreetSmart/documentation). Controleer bij de eerste echte aanroep de opties van init en open.
//
// Instellen in .env.local (daarna de app herstarten):
//   STREETSMART_API_KEY     API-sleutel van Cyclomedia (altijd nodig)
// en één van beide manieren van aanmelden:
//   STREETSMART_CLIENT_ID   OAuth: iedere gebruiker meldt zich aan met zijn eigen Cyclomedia-account (aanbevolen)
//   STREETSMART_USERNAME + STREETSMART_PASSWORD   één gedeeld account
// optioneel:
//   STREETSMART_API_VERSION  standaard v26.4
//
// De JavaScript-API van Cyclomedia draait in de browser. Sleutel en bij een gedeeld account ook gebruikersnaam en
// wachtwoord gaan daarom naar de browser van wie de werkplek opent. Zolang de werkplek geen inlog heeft, is OAuth de
// veilige keuze. Het meekijkportaal voor de opdrachtgever krijgt deze gegevens niet.
export type StreetSmartConfig = {
  beschikbaar: boolean;
  ontbreekt: string[];
  versie: string;
  apiKey?: string;
  aanmelden?: "oauth" | "account";
  clientId?: string;
  username?: string;
  password?: string;
};

export function streetSmartConfig(): StreetSmartConfig {
  const e = process.env;
  const versie = e.STREETSMART_API_VERSION || "v26.4";
  const ontbreekt: string[] = [];
  if (!e.STREETSMART_API_KEY) ontbreekt.push("STREETSMART_API_KEY (API-sleutel van Cyclomedia)");
  const oauth = !!e.STREETSMART_CLIENT_ID, account = !!(e.STREETSMART_USERNAME && e.STREETSMART_PASSWORD);
  if (!oauth && !account) ontbreekt.push("STREETSMART_CLIENT_ID (aanmelden met eigen account, OAuth) of STREETSMART_USERNAME en STREETSMART_PASSWORD (gedeeld account)");
  if (ontbreekt.length) return { beschikbaar: false, ontbreekt, versie };
  return oauth
    ? { beschikbaar: true, ontbreekt, versie, apiKey: e.STREETSMART_API_KEY, aanmelden: "oauth", clientId: e.STREETSMART_CLIENT_ID }
    : { beschikbaar: true, ontbreekt, versie, apiKey: e.STREETSMART_API_KEY, aanmelden: "account", username: e.STREETSMART_USERNAME, password: e.STREETSMART_PASSWORD };
}
