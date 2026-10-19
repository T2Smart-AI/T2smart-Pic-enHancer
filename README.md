# t2smart-pichancer

Éditeur de photos basé sur un moteur de rendu haute performance.
*A high-performance photo editing engine. A static web app for advanced image manipulation.*

👉   https://t2smart-ai.github.io/T2smart-Pic-enHancer/ 

## 🚀 Fonctionnalités

- **Gestion d'images** : Upload, photos de démo (ville, côte, portrait), historique (Undo/Redo) et sauvegarde en galerie.
- **Retouche Avancée** :
    - Ajustements de lumière, couleur, FX et détails.
    - Gestion des courbes, calques et optique (Lens).
    - Mode Portrait et création de collages.
- **Outils IA** : Génération d'images et remplissage génératif.
- **Export** : Partage et exportation rapide.

## 🛠️ Démarrage Rapide

Lancer l'application localement via Python :

```bash
python3 -m http.server 8000
```
Accédez ensuite à `http://localhost:8000` dans votre navigateur.

## 🕹️ Guide d'utilisation

| Contrôle | Rôle |
| :--- | :--- |
| **Upload / Demo** | Importer une image ou utiliser un exemple |
| **Looks / Light / Color** | Appliquer des filtres et ajuster la colorimétrie |
| **FX / Detail / Curves** | Retouches fines et effets visuels |
| **Layers / Lens** | Gestion des calques et correction optique |
| **Portrait / Collage** | Outils de composition et portrait |
| **Sliders (Light, Color, etc.)** | Réglage précis des paramètres d'image |
| **Export / Share** | Sortie finale du projet |

## ⚙️ Fonctionnement

L'application est un **site statique** utilisant l'API Canvas pour le rendu. L'intelligence artificielle est intégrée sans clé API côté client grâce à :
- **Puter.js & Pollinations** : Permet la génération d'images avec des limites gratuites (environ 30s à 45s par requête).
- **Plugins** : Utilisation du `text-to-image-plugin` et du `kv-plugin` pour la persistance.

## 📁 Structure du Projet

- `src/psx/engine.js` & `app.js` : Cœur du moteur et logique applicative.
- `src/psx/gpu.js` : Rendu graphique et shaders.
- `src/psx/looks.js` (1, 2, 3) & `lens.js` : Bibliothèques de filtres et optiques.
- `src/psx/layers.js`, `portrait.js`, `collage.js` : Modules de composition.
- `src/psx/genfill.js` : Logique de remplissage IA.
- `src/psx/i18n.js` : Gestion du multilingue.
- `src/psx/share.js` : Module d'exportation.

## 🛠️ Configuration

Les adaptations de filtres et les paramètres de rendu se configurent dans :
`src/psx/adapters.js`

## 🚀 Déploiement

Le projet est optimisé pour **GitHub Pages**. Pour déployer :
1. Poussez le code sur votre dépôt GitHub.
2. Activez GitHub Pages dans les paramètres du dépôt (`Settings` > `Pages`).

## 📄 Licence

Ce projet est sous licence **MIT**.
