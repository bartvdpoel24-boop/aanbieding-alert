# AanbiedingAlert

Een simpele webapp (PWA) om producten bij te houden die je **alleen in de aanbieding** wilt kopen.

## Functies

- Voeg producten toe (bijv. toiletpapier, wasmiddel, koffie).
- Stel een maximale prijs in waaronder je een melding wilt.
- **Grok stelt een prijs voor** op basis van de huidige aanbiedingen.
- In Instellingen: een lijst met suggesties van producten die mensen vaak alleen in de aanbieding kopen.
- Check handmatig of automatisch (bij openen, als >20 uur geleden).
- Browsernotificaties wanneer de prijs onder jouw drempel komt.
- Data van **PrijsProfeet** (meer dan 10 Nederlandse supermarkten: AH, Jumbo, Lidl, Aldi, PLUS, Dirk, etc.).

## Gebruik

1. Open `index.html` in je browser (of host de map ergens).
2. Schakel notificaties in via Instellingen.
3. Voeg producten toe en stel drempels in.
4. De app controleert automatisch bij openen (of klik op "Check alles nu").

Je kunt de app ook "installeren" als PWA op je telefoon (via browser-menu → Toevoegen aan startscherm).

## Opmerkingen

- Alle data blijft lokaal in je browser (localStorage).
- API-aanroepen hebben rate limits; de app doet er netjes mee.
- PrijsProfeet ververst de data elke nacht.
- Voor de beste ervaring: open de app regelmatig (of voeg hem toe aan je startscherm).

Gemaakt met hulp van Grok.

## Publiceren

Je kunt deze app publiceren via GitHub Pages:
1. Ga naar Settings > Pages
2. Kies branch `main` en folder `/ (root)`
3. Sla op. De app is dan beschikbaar op https://bartvdpoel24-boop.github.io/aanbieding-alert/
