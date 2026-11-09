ANDAR BAHAR — FIRST INTEGRATION STEP

Files in this package:
- homepage.html: existing homepage with one new ANDAR BAHAR button
- homepage.js: existing homepage JavaScript plus openAndarBahar()
- andar.html: mobile single-view game prototype showing the logged-in account name, user ID, and balance passed from the homepage

Deployment:
1. Back up your current homepage.html and homepage.js.
2. Replace them with the two files in this package. Keep your existing homepage.css and other assets unchanged.
3. Add andar.html beside homepage.html on the same GitHub Pages site.
4. Sign in normally, click ANDAR BAHAR, and check the displayed name, shortened user ID, and balance.

Important: the cards, betting, and balance changes inside andar.html are still simulated locally. This step only passes account details for display; it does not place real database bets or change the actual account balance. The existing localStorage session token is not placed in the URL.
