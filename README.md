<img src="assets/icon.svg" width="64" height="64" alt="">

# MSK TCG

Jeu de cartes à collectionner d’imagerie musculosquelettique (DA du QUIZ Cochin MSK).
Ouvrez un booster (glissez pour le déchirer) : chaque carte n’affiche que l’image, touchez-la pour révéler le diagnostic et une description courte. Les cartes rejoignent le classeur (mode révision : titres masqués).

- 198 cartes : figures du Cotten (pathologies générales + épaule), cas anonymisés du Quiz Imagerie (Cochin), SIMS 2025.
- 5 boosters / heure, 5 cartes par booster (la plus rare en dernier), cartes jamais vues favorisées.
- PWA statique hors-ligne : `index.html`, `styles.css`, `app.js`, `data/embedded_data.js`, `cards/*.webp`.

## Ajouter / modifier des cartes
1. Éditer `data/selection.json` (titre, description, région, modalité, rareté, `crop`, `path` de l’image source).
2. `python3 scripts/build_cards.py` (Pillow requis) → régénère `cards/`, `data/cards.json`, `data/embedded_data.js`.
3. Incrémenter `?v=` dans `index.html` et `VERSION` dans `sw.js`, puis commit + push.
