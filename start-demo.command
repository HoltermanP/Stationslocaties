#!/bin/bash
# Start de LQS-werkplek voor een demo: dubbelklik op dit bestand. Sluit dit venster om de app te stoppen.
cd "$(dirname "$0")" || exit 1
POORT=3210
ADRES="http://localhost:$POORT"

if lsof -ti "tcp:$POORT" >/dev/null 2>&1; then
  echo "De app draait al op $ADRES."
  open "$ADRES"
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ontbreekt. Installeer Node.js 20 of hoger via https://nodejs.org en probeer het opnieuw."
  read -r -p "Druk op Enter om te sluiten."
  exit 1
fi
[ -d node_modules ] || npm install || exit 1
echo "De app wordt gebouwd; dit duurt ongeveer een halve minuut."
npm run build || { read -r -p "De bouw is mislukt. Druk op Enter om te sluiten."; exit 1; }
(sleep 3 && open "$ADRES") &
echo "De app draait op $ADRES. Sluit dit venster om te stoppen."
exec npx next start -p "$POORT"
