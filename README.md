<img src="assets/icon.svg" width="64" height="64" alt="">

# MSK TCG

Jeu de cartes à collectionner d’imagerie musculosquelettique (DA du QUIZ Cochin MSK).
Ouvrez un booster (glissez pour le déchirer) : chaque carte n’affiche que l’image, touchez-la pour révéler le diagnostic et une description courte. Les cartes rejoignent le classeur (mode révision : titres masqués).

- 428 cartes : figures du Cotten (pathologies générales, loco-régionales 2017, épaule), cas Cochin déjà présentés (Bone Club, présentations, cours — jamais les cas « à présenter »), images des mails d’avis (anonymisées), cas du Quiz Imagerie.
- 5 boosters / heure, 5 cartes par booster (la plus rare en dernier), cartes jamais vues favorisées.
- PWA statique hors-ligne : `index.html`, `styles.css`, `app.js`, `deck.js`, `data/embedded_data.js`, `cards/*.webp`.

## Éditeur (retirer / modifier des cartes depuis le téléphone)
- `edit.html` (bouton ✎ du Classeur) : recherche, filtres, modification du titre / description / rareté / région / modalité, « Retirer du jeu » / « Remettre dans le jeu ».
- « Publier » écrit `data/overrides.json` sur GitHub (API contents) avec un jeton *fine-grained* limité au dépôt `msk-tcg` (Contents : read & write), stocké uniquement dans le navigateur de l’appareil.
- `deck.js` applique ces overrides au lancement du jeu (cartes retirées exclues, numérotation recalculée) ; la dernière version est gardée en cache local pour le hors-ligne.
- ⚠️ L’éditeur commite sur `main` : faire `git pull` avant toute modification locale.

## Ajouter / modifier des cartes (en masse)
1. Éditer `data/selection.json` (titre, description, région, modalité, rareté, `crop`, `path` de l’image source).
2. `python3 scripts/build_cards.py` (Pillow requis) → régénère `cards/`, `data/cards.json`, `data/embedded_data.js`.
3. Incrémenter `?v=` dans `index.html` et `VERSION` dans `sw.js`, puis commit + push.
