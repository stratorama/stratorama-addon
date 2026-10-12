# Stratorama - Agent (application Home Assistant)

[English](README.md) | Français

Stratorama - Agent est une petite application Home Assistant (anciennement appelée module complémentaire, ou add-on)
qui relie votre Home Assistant à votre compte [Stratorama](https://stratorama.app/fr)&nbsp;: votre
maison sur un plan, en direct, que vous commandez de n’importe où, sans exposer Home Assistant à
Internet. L’agent ouvre **une seule connexion sortante** vers le relais de Stratorama, et rien
d’autre&nbsp;: pas de redirection de port, pas d’URL publique, aucun jeton de longue durée remis à
un navigateur.

```
[Stratorama dans votre navigateur]  --HTTPS-->  [relais stratorama.app]  <--WebSocket sortant--   [l’agent]
                                                                                                      |
                                                                                                      v  http://supervisor/core
                                                                                              [Home Assistant]
```

Open source, sous licence MIT. Images pour **amd64** et **aarch64**.

## Prérequis

- **Home Assistant OS**&nbsp;: installez l’application Stratorama - Agent comme indiqué ci-dessous
  (les applications ont besoin du Supervisor, que fournit Home Assistant OS&nbsp;; l’installation
  Supervised, qui n’est plus prise en charge, l’a aussi).
- **Home Assistant Container**&nbsp;: les applications n’y tournent pas&nbsp;; faites donc tourner
  le même agent sous forme d’image Docker (voir
  [Home Assistant Container (Docker)](#home-assistant-container-docker)).
- Une machine 64&nbsp;bits&nbsp;: **amd64** (x86-64) ou **aarch64** (Raspberry Pi 4 / 5, Home
  Assistant Green et Yellow, la plupart des mini-PC de type NUC). L’ARM 32&nbsp;bits (armv7) n’est
  pas pris en charge.
- Un compte Stratorama, gratuit&nbsp;: https://stratorama.app/fr.

## Installation

### 1. Ajoutez ce dépôt au magasin d’applications de Home Assistant

[![Ouvrir votre instance Home Assistant sur la boîte de dialogue d’ajout d’un dépôt d’applications, avec ce dépôt prérempli.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fstratorama%2Fstratorama-addon)

Le bouton préremplit la boîte de dialogue dans votre propre Home Assistant. Chemin
manuel&nbsp;: **Paramètres > Applications > Installer une application** (ouvre le **Magasin
d’applications**) > menu à trois points en haut à droite > **Dépôts** > **Ajouter un dépôt**
(avant Home Assistant 2026.2&nbsp;: **Paramètres > Modules complémentaires > Boutique des
modules complémentaires**, même menu), avec cette adresse&nbsp;:

```
https://github.com/stratorama/stratorama-addon
```

### 2. Installez Stratorama - Agent

L’agent apparaît dans le magasin sous **Stratorama**. Appuyez sur **Installer** (l’image est
téléchargée telle quelle&nbsp;: rien n’est compilé sur votre machine).

### 3. Appairez-le avec votre maison Stratorama

1. Dans Stratorama, ouvrez le menu (les trois points, en haut à droite), puis **Home Assistant >
   Connexion** et appuyez sur **Générer un code d’appairage**. Le code fait 8&nbsp;caractères et
   reste valable 10&nbsp;minutes.
2. Dans l’onglet **Configuration** de l’agent, collez-le dans **Code d’appairage** (**Pairing
   code** si le champ s’affiche en anglais) et appuyez sur **Enregistrer**. Laissez **URL du
   tunnel** (**Tunnel URL**) à sa valeur par défaut. Home Assistant n’affiche aucun message après
   l’enregistrement, et c’est normal&nbsp;: le code est enregistré (si l’agent tourne déjà, Home
   Assistant demande «&nbsp;Redémarrer Stratorama - Agent&nbsp;?&nbsp;»&nbsp;: appuyez sur
   **Redémarrer**).
3. De retour dans l’onglet **Info**, appuyez sur **Démarrer**. En quelques secondes, la fenêtre
   de connexion affiche **Connecté**, et le petit logo Home Assistant en haut à droite de votre
   plan passe au vert.

L’agent détient désormais son propre identifiant de longue durée, dans son dossier
`/data`&nbsp;: il se reconnecte tout seul après un redémarrage ou une mise à jour de Home
Assistant, et vous pouvez vider le champ **Code d’appairage**.

### 4. Placez vos appareils sur le plan

Dans Stratorama, en mode édition, touchez un appareil sur le plan (ou l’icône crayon dans la
liste **Éléments**), puis **Appareil** (sur un capteur, **Ajouter un relevé**), et choisissez
l’entité Home Assistant. Pris en charge aujourd’hui&nbsp;: les lumières et les rubans LED
(`light.*`), les volets roulants (`cover.*`), les prises et les électrovannes (`switch.*`), et
les capteurs en lecture seule (`sensor.*`, et `binary_sensor.*`, comme un capteur de porte, de
mouvement ou de fuite). La suite se trouve dans [Utiliser le plan](#utiliser-le-plan).

## Home Assistant Container (Docker)

Home Assistant Container n’a pas de Supervisor&nbsp;: il ne peut donc pas faire tourner
d’applications Home Assistant. Le même agent existe sous forme d’image Docker simple,
`ghcr.io/stratorama/stratorama-agent`, pour **amd64** et **arm64**. Il tourne à côté de Home
Assistant, n’ouvre aucun port et fait exactement ce que fait
l’application Stratorama - Agent&nbsp;: une seule connexion sortante vers le relais, et les mêmes
neuf appels à Home Assistant, aucun autre.

### 1. Créez un jeton d’accès dans Home Assistant

Installé comme application, l’agent reçoit un jeton du Supervisor&nbsp;; en conteneur, il faut
lui en donner un.

1. Recommandé&nbsp;: un utilisateur dédié. Dans Home Assistant, **Paramètres > Personnes >
   Utilisateurs > Ajouter un utilisateur**, nommez-le `Stratorama` et laissez
   **Administrateur** désactivé&nbsp;: l’agent n’a besoin d’aucun droit d’administration. Home
   Assistant attribue alors ce que fait l’agent à cet utilisateur, et supprimer l’utilisateur
   révoque son accès.
2. Dans une session de cet utilisateur (ou dans la vôtre, si vous sautez l’étape 1), ouvrez le
   profil, onglet **Sécurité**, **Jetons d’accès longue durée > Créer un jeton**, nommez le
   jeton `Stratorama agent` et copiez-le&nbsp;: Home Assistant ne l’affiche qu’une fois.

Le jeton ne quitte jamais votre réseau&nbsp;: l’agent le présente à Home Assistant et à rien
d’autre, et le relais ne le voit jamais. Le relais ne reçoit pas non plus `HA_URL`&nbsp;:
Stratorama ne connaît jamais l’adresse réseau de votre Home Assistant.

### 2. Générez un code d’appairage dans Stratorama

Le menu (les trois points, en haut à droite) > **Home Assistant > Connexion > Générer un code
d’appairage**. Le code fait 8&nbsp;caractères, reste valable 10&nbsp;minutes et ne sert qu’une
fois.

### 3. Démarrez l’agent

`compose.yaml`&nbsp;:

```yaml
services:
  stratorama-agent:
    image: ghcr.io/stratorama/stratorama-agent:latest
    container_name: stratorama-agent
    restart: unless-stopped
    environment:
      HA_URL: http://192.168.1.10:8123   # l’adresse à laquelle vous ouvrez Home Assistant
      HA_TOKEN: "collez-ici-le-jeton-d-acces-longue-duree"
      PAIRING_CODE: "ABCD2345"           # lu au premier démarrage seulement
    volumes:
      - stratorama-agent-data:/data      # là où l’agent garde son identifiant

volumes:
  stratorama-agent-data:
```

```bash
docker compose up -d
docker compose logs -f stratorama-agent
```

En quelques secondes, le journal affiche `Registered with the relay` (l’agent est enregistré
auprès du relais) et la fenêtre de connexion de Stratorama affiche **Connecté**&nbsp;; une
trentaine de secondes plus tard, `docker ps` indique le conteneur comme `healthy`. L’agent garde
désormais son propre identifiant dans le volume&nbsp;: il se reconnecte tout seul après un
redémarrage du conteneur ou de la machine, ou une mise à jour de l’image, et `PAIRING_CODE`
n’est plus relu, sauf si vous déconnectez Home Assistant. Placez ensuite vos appareils sur le
plan, comme à
[l’étape 4 de l’installation sur Home Assistant OS](#4-placez-vos-appareils-sur-le-plan).

La même chose sans Compose&nbsp;:

```bash
docker run -d --name stratorama-agent --restart unless-stopped \
  -e HA_URL=http://192.168.1.10:8123 -e HA_TOKEN=collez-le-jeton-ici -e PAIRING_CODE=ABCD2345 \
  -v stratorama-agent-data:/data ghcr.io/stratorama/stratorama-agent:latest
```

**Quelle `HA_URL`&nbsp;?** Toute adresse à laquelle le conteneur de l’agent joint Home
Assistant&nbsp;:

- l’adresse de Home Assistant sur votre réseau, comme `http://192.168.1.10:8123`&nbsp;: elle
  marche dans toutes les configurations&nbsp;;
- `http://homeassistant:8123` quand les deux conteneurs partagent un réseau Compose et que le
  service Home Assistant s’appelle `homeassistant`&nbsp;;
- `http://localhost:8123` seulement si l’agent tourne lui aussi avec `network_mode: host`.

Le HTTPS marche aussi (`https://...`). Avec un certificat auquel le conteneur ne fait pas
confiance (autosigné), montez son autorité de certification dans le conteneur et faites pointer
`NODE_EXTRA_CA_CERTS` dessus.

### Variables d’environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `HA_URL` | oui | L’adresse de Home Assistant&nbsp;: `http(s)://host:port`, sans chemin. |
| `HA_TOKEN` | oui, ou `HA_TOKEN_FILE` | Un jeton d’accès longue durée. |
| `HA_TOKEN_FILE` | | Un fichier qui contient le jeton à la place, comme un secret Docker dans `/run/secrets/ha_token`. |
| `PAIRING_CODE` | au premier démarrage seulement | Le code de 8&nbsp;caractères obtenu dans Stratorama. |
| `TUNNEL_URL` | non | `wss://stratorama.app/agent` par défaut. Ne la changez que si vous faites tourner votre propre relais. |

### Mise à jour et déconnexion

- Mise à jour&nbsp;: `docker compose pull && docker compose up -d`.
- **Déconnecter Home Assistant**, dans Stratorama (Menu > Home Assistant > Connexion), révoque
  aussitôt l’identifiant de l’agent. `docker compose down -v` supprime ensuite le conteneur et
  son volume, et supprimer le jeton (ou l’utilisateur `Stratorama`) dans Home Assistant lui
  retire aussi son accès de ce côté.

### En cas de problème

`docker ps` indique le conteneur comme `unhealthy` chaque fois que l’agent n’est pas à la fois
enregistré auprès du relais et abonné à Home Assistant. `docker compose logs stratorama-agent`
dit pourquoi, en anglais&nbsp;:

| Le journal dit | Ce que cela signifie, et que faire |
|---|---|
| `HA_URL is not set`, `HA_TOKEN is not set`, `HA_URL must be the address of Home Assistant itself` | une variable manque, ou `HA_URL` ne désigne pas Home Assistant lui-même&nbsp;: corrigez-la. D’ici là, le conteneur s’arrête et Docker le redémarre |
| `Home Assistant rejected HA_TOKEN` | Home Assistant refuse le jeton&nbsp;: créez-en un nouveau, mettez-le dans `HA_TOKEN`, puis `docker compose up -d` |
| `Home Assistant has not answered at ...` | Home Assistant ne répond pas à cette adresse&nbsp;: `HA_URL` est fausse, ou injoignable depuis le conteneur (voir «&nbsp;Quelle `HA_URL`&nbsp;?&nbsp;» plus haut) |
| `Pairing refused: ...`, `The relay no longer accepts this agent's credential` | le relais refuse le code d’appairage, ou l’identifiant de l’agent&nbsp;: générez un nouveau code dans Stratorama, mettez-le dans `PAIRING_CODE`, puis `docker compose up -d` |
| `Could not store the credential in /data/agent-token.json` | l’agent n’a pas pu enregistrer son identifiant, parce que `/data` est un dossier de l’hôte où l’uid 1000 ne peut pas écrire&nbsp;: utilisez le volume nommé ci-dessus, ou donnez ce dossier à l’uid 1000 |
| `Relay WS error` répété | erreur de connexion au relais&nbsp;: le conteneur ne joint pas `stratorama.app` sur le port 443. Vérifiez votre pare-feu et votre DNS |

Sur un refus qu’aucun nouvel essai ne peut corriger (un code d’appairage ou un identifiant que
le relais refuse, un jeton que Home Assistant rejette), l’agent **reste démarré sans se
connecter** au lieu de s’arrêter, pour que la politique de redémarrage de Docker ne présente pas
de nouveau les mêmes valeurs refusées toutes les minutes. Modifiez la configuration, puis
recréez le conteneur&nbsp;: `docker compose up -d` le fait quand le fichier compose a changé,
alors que `docker restart` le redémarrerait avec les anciennes valeurs.

L’image tourne sous un utilisateur sans privilèges (uid 1000), n’ouvre aucun port et n’écrit
rien sur votre hôte, hormis son propre volume. Elle est construite à partir de
[`stratorama_agent/Dockerfile.standalone`](stratorama_agent/Dockerfile.standalone).

## Utiliser le plan

Une fois Home Assistant connecté, la suite se passe dans Stratorama, quelle que soit la façon
dont l’agent tourne.

### Vos appareils, nommés une fois

Le menu > **Home Assistant > Appareils** ouvre votre bibliothèque d’appareils (en mode édition,
**Gérer les appareils**, dans le sélecteur d’entités, l’ouvre aussi). Nommez-y chaque appareil
Home Assistant et réglez-y une fois pour toutes la plage de confort d’un capteur&nbsp;: placer
un élément sur le plan propose alors d’abord cette courte liste, sous **Vos appareils**, avec
les noms que vous avez donnés.

- Appuyez sur **Ajouter**, à côté du titre **Appareils HA**, puis choisissez l’entité Home Assistant&nbsp;: l’appareil est créé
  sous le nom que Home Assistant donne à l’entité, et vous pouvez le renommer aussitôt. Un
  capteur d’humidité, ou un capteur de température en degrés Celsius, arrive avec une plage de
  confort usuelle déjà remplie.
- **Retirer de la bibliothèque** efface seulement le nom personnalisé et la plage de
  confort&nbsp;: les éléments déjà placés sur le plan continuent de fonctionner.

### Plage de confort

La plage de confort d’un capteur est un minimum et un maximum&nbsp;: en dehors, les relevés de
cet appareil sont teintés sur le plan. Elle appartient à l’appareil plutôt qu’à un élément&nbsp;:
elle s’applique donc partout où l’appareil est affiché, et la régler depuis la bibliothèque ou
depuis un relevé sur le plan modifie la même valeur.

### Capteurs et relevés

Un **Capteur** placé sur le plan n’affiche que son nom tant qu’il n’a pas de relevé&nbsp;: dans
sa configuration, appuyez sur **Ajouter un relevé** et choisissez une entité Home Assistant
`sensor.*` ou `binary_sensor.*` (un capteur de porte, de mouvement ou de fuite, par exemple)&nbsp;:
sa valeur en direct apparaît sur le plan. Un capteur peut porter plusieurs relevés, par exemple une
température et une humidité.

### Portes et capteurs d’ouverture

Toute porte est dessinée fermée, sauf si un capteur dit le contraire. Dans l’inspecteur de mur
(voir plus bas), la ligne d’une porte propose **Lier un capteur d’ouverture**&nbsp;: choisissez
un `binary_sensor` Home Assistant (n’importe lequel, sa classe n’a pas besoin d’être `door`), et
la porte est dessinée ouverte tant que ce capteur indique une ouverture.

### Murs

Un mur réagit une fois sa pièce sélectionnée&nbsp;: en mode édition, touchez une pièce, puis
l’un de ses murs sur le plan, et l’inspecteur de mur s’ouvre (épaisseur, courbe, angles,
ouvertures).

**Appliquer à la pièce** donne à chaque mur de la pièce l’épaisseur et le sens d’épaississement
de ce mur, et à chaque angle de la pièce l’arrondi d’angle de ce mur (si ses deux angles
diffèrent, celui que vous avez réglé en dernier depuis l’ouverture de l’inspecteur&nbsp;; si
vous n’avez réglé ni l’un ni l’autre depuis, les angles restent tels quels). Deux choses vont
au-delà de la pièce&nbsp;:

- un mur partagé avec une pièce voisine est un seul et même mur&nbsp;: il change donc aussi dans
  cette pièce&nbsp;;
- un angle est partagé avec tout ce qui s’y rejoint&nbsp;: l’arrondi s’applique donc aussi là où
  d’autres pièces rejoignent les angles de la pièce.

Sur un mur partagé, le bouton est désactivé, puisque «&nbsp;la pièce&nbsp;» pourrait être l’une
ou l’autre&nbsp;: sélectionnez un mur que seule cette pièce possède. Le bouton d’annulation, dans
l’en-tête de l’inspecteur (ou Ctrl+Z / Cmd+Z), défait d’un seul appui tout ce qu’**Appliquer à la
pièce** a changé.

### Pièces et étages

- **Supprimer la pièce** agit tout de suite, et les éléments placés dans la pièce sont supprimés
  avec elle. Un mur qu’elle partage avec une pièce voisine reste&nbsp;: la voisine en a encore
  besoin.
- L’icône crayon d’un étage, dans la liste **Étages**, règle ses rôles. **Étage par défaut**
  (l’étoile de la liste)&nbsp;: la présentation s’ouvre sur cet étage. **Rez-de-chaussée** (l’icône
  de maison)&nbsp;: chaque étage au-dessus est dessiné sur un léger contour des murs du dessous, si
  bien qu’un étage supérieur peut se tracer sur ce qui le porte&nbsp;; rien n’est tracé sous le
  rez-de-chaussée. Si aucun n’est défini, l’étage du bas compte comme rez-de-chaussée.
- **Supprimer l’étage** (tant que la maison en a plus d’un) vous demande de confirmer&nbsp;: ses
  pièces, et les éléments qu’elles contiennent, sont supprimés avec lui.

## Ce que fait l’agent, et ce qui sort de chez vous

| Sens | Quoi | Quand |
|---|---|---|
| Relais -> Home Assistant | `GET /api/states` (l’instantané des entités quand un plan se charge, quand le sélecteur d’entités s’ouvre ou quand on appuie sur **Voir la valeur** dans le sélecteur&nbsp;; l’agent répond selon ce que précise la requête du relais, voir plus bas) et les appels de service pour les appareils de votre plan&nbsp;: services `light`, `switch` et `cover` seulement (allumer / éteindre, luminosité et couleur, ouvrir / fermer / arrêter / position). L’agent refuse lui-même tout autre appel, d’où qu’il vienne&nbsp;: la liste exacte est dans [`src/ha-allowlist.ts`](stratorama_agent/src/ha-allowlist.ts) | à la demande |
| Home Assistant -> relais | les événements `state_changed` des entités de votre plan (ses appareils, leurs relevés, les capteurs de vos portes, votre bibliothèque d’appareils), des cinq domaines ci-dessous et sans les jetons ci-dessous&nbsp;; rien d’autre | en continu |
| Home Assistant -> relais, sur demande | la liste des entités pour le sélecteur&nbsp;: les entités de votre plan en entier, toutes les autres lumières, interrupteurs, volets et capteurs par nom, type et unité seulement&nbsp;; la valeur d’une entité quand une personne pouvant modifier le plan appuie sur **Voir la valeur** | à l’ouverture du sélecteur |

Depuis la version 1.4.0, l’agent ne transmet un changement d’état que pour les entités de votre
plan, que le relais de Stratorama lui indique après chaque connexion et chaque fois que vous
liez ou dissociez quelque chose&nbsp;; tant que le relais ne l’a pas fait, l’agent ne transmet
rien. Chaque réponse à `GET /api/states` est réduite à ce que précise la requête du relais
([`src/ha-views.ts`](stratorama_agent/src/ha-views.ts))&nbsp;: l’instantané du plan aux entités
que la personne ou la tablette qui demande a le droit de voir, la liste du sélecteur aux noms,
types et unités pour tout ce qui n’est pas sur votre plan, **Voir la valeur** à une seule
entité. La réponse à un appel de service se limite à son statut. Depuis la version 1.3.0, et par
tous les chemins, seuls les cinq domaines que Stratorama affiche peuvent sortir
([`src/ha-domains.ts`](stratorama_agent/src/ha-domains.ts))&nbsp;: les entités `person` et
`device_tracker`, les caméras, les lecteurs multimédias et tous les autres domaines restent chez
vous. Un capteur que vous ne placez pas sur le plan (l’adresse géocodée d’un téléphone, un code
à usage unique) sort comme un nom dans la liste du sélecteur, jamais comme une valeur, sauf si
une personne pouvant modifier le plan la demande. Les changements d’état traversent le relais
**uniquement en mémoire**&nbsp;: rien n’y est écrit sur disque, et chaque navigateur ou tablette
murale ne reçoit que les entités liées aux parties du plan qu’il a le droit de voir. L’agent ne lit jamais l’**Historique** ni
l’**Activité** de Home Assistant, ne touche jamais aux automatisations et n’envoie jamais
d’identifiants Home Assistant nulle part&nbsp;: le Supervisor lui remet un jeton local qui ne
quitte pas l’agent. Home Assistant place aussi ses propres jetons dans certains états (un
attribut `access_token`, le `?token=` du lien d’image d’une caméra, un jeton de flux dans un
chemin `/api/hls/`), et l’un d’eux peut se retrouver dans un état que l’agent envoie (un capteur
template dont l’état est le lien d’image d’une caméra)&nbsp;: l’agent les retire, sous les formes
où Home Assistant les écrit, avant que l’état ne quitte votre maison, de même que les liens
d’image des entités et le `user:password@` d’une adresse
([`src/ha-redact.ts`](stratorama_agent/src/ha-redact.ts)). Stratorama ne connaît pas non plus
l’adresse réseau de votre Home Assistant&nbsp;: la connexion part de chez vous, si bien que rien
n’a jamais besoin d’y entrer. Le détail complet figure dans la politique de confidentialité de
Stratorama&nbsp;: https://stratorama.app/fr/privacy.

## Permissions

L’application Stratorama - Agent déclare `homeassistant_api: true`, et rien d’autre. Cela lui
donne&nbsp;:

- `http://supervisor/core/api/...` (REST) et `ws://supervisor/core/api/websocket` (événements
  d’état) sur votre propre Home Assistant,
- la variable d’environnement `SUPERVISOR_TOKEN`, injectée par le Supervisor, valable seulement
  sur le réseau local.

Pas de `host_network`, pas de `hassio_api`, pas d’`auth_api`, pas de `privileged`, aucun dossier
monté, pas d’ingress. L’agent ne fait que des connexions **sortantes** et n’ouvre aucun port.

## Déconnexion et révocation

Dans Stratorama, **Menu > Home Assistant > Connexion > Déconnecter Home Assistant** révoque
aussitôt l’identifiant de l’agent&nbsp;: la connexion tombe en moins d’une seconde, et l’agent
ne peut pas se reconnecter tant qu’il n’est pas réappairé avec un nouveau code. Désinstaller
l’agent supprime son dossier `/data`, identifiant compris. Appairer un second Home Assistant à la
même maison remplace l’identifiant du premier.

## Référence de la configuration

| Option | Type | Obligatoire | Description |
|---|---|---|---|
| `pairing_code` (**Code d’appairage**) | chaîne | au premier démarrage seulement | Le code de 8&nbsp;caractères obtenu dans Stratorama. Utilisé une fois, puis ignoré. |
| `tunnel_url` (**URL du tunnel**) | url | oui | `wss://stratorama.app/agent`. Ne la changez que si vous faites tourner votre propre relais. |

## Dépannage

Tout ce que l’agent a à dire se trouve dans son onglet **Journal**, en anglais. Quand il
s’arrête volontairement (les cinq premières lignes), Home Assistant l’affiche comme arrêté, en
erreur&nbsp;: rien ne changera tant que la configuration n’aura pas changé, c’est pourquoi il ne
réessaie pas auprès du relais toutes les minutes.

| Le journal dit | Ce que cela signifie | Que faire |
|---|---|---|
| `Pairing refused: the relay does not know this pairing code` | le relais ne connaît pas ce code&nbsp;: mal saisi, ou refusé après trop d’essais | générez un nouveau code dans Stratorama, collez-le dans **Code d’appairage**, enregistrez, démarrez |
| `Pairing refused: this pairing code has already been used` | ce code a déjà servi, et un code ne sert qu’une fois | idem |
| `Pairing refused: this pairing code has expired` | ce code a expiré&nbsp;: il n’est valable que 10&nbsp;minutes | idem |
| `The relay no longer accepts this agent's credential` | le relais n’accepte plus l’identifiant de l’agent&nbsp;: quelqu’un a appuyé sur **Déconnecter Home Assistant** dans Stratorama, ou un autre Home Assistant a été appairé à la maison | idem&nbsp;; si un nouveau code est déjà dans la configuration, l’agent l’essaie de lui-même |
| `No stored credential and no pairing code in the configuration` | aucun identifiant enregistré ni code d’appairage dans la configuration&nbsp;: premier démarrage sans code | idem |
| `Relay WS error` répété, agent «&nbsp;En cours d’exécution&nbsp;», Stratorama «&nbsp;Non connecté&nbsp;» | erreur de connexion au relais&nbsp;: l’agent ne joint pas `stratorama.app` sur le port 443 | vérifiez votre pare-feu et votre DNS&nbsp;; l’agent réessaie de lui-même, au plus une fois par minute |
| `No frame from the relay for 90 s` | aucune trame du relais depuis 90&nbsp;secondes&nbsp;: le réseau a coupé la connexion sans prévenir (NAT, fournisseur d’accès)&nbsp;; l’agent se reconnecte de lui-même | rien, sauf si cela revient à quelques minutes d’intervalle&nbsp;: regardez alors du côté du réseau |
| `refusing it for now`, `reconnecting in 5 min` | le relais refuse pour l’instant cette adresse, qui a échoué trop d’appairages en 15&nbsp;minutes&nbsp;; l’agent réessaie dans 5&nbsp;minutes | attendez, puis vérifiez le code d’appairage |
| `Refusing ha:request`, `not one of the calls this agent relays` | Stratorama a demandé quelque chose que cette version de l’agent ne relaie pas | mettez l’agent à jour |
| `Home Assistant rejected the Supervisor token` | Home Assistant refuse le jeton du Supervisor, qui n’arrive pas jusqu’à l’agent | possible seulement sur une version modifiée de l’agent (un fork) qui a retiré `homeassistant_api: true` |
| Le magasin affiche l’agent «&nbsp;Non disponible&nbsp;» | machine 32&nbsp;bits (armv7) ou i386 | non prise en charge |
| L’installation échoue pendant le téléchargement de l’image | incident passager du registre d’images | réessayez une minute plus tard, puis signalez-le (voir Assistance) |

## Assistance

- Problèmes et questions&nbsp;: https://github.com/stratorama/stratorama-addon/issues
- Email&nbsp;: contact@stratorama.app

## Développement

L’agent se trouve dans `./stratorama_agent/` (le Supervisor cherche un `config.yaml` dans les
sous-dossiers)&nbsp;; le `repository.yaml` à la racine fait de ce dépôt un dépôt d’applications.

```bash
cd stratorama_agent
npm ci
npm run typecheck
docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20 -t stratorama-agent:dev .
docker build -f Dockerfile.standalone -t stratorama-agent-standalone:dev .
```

Une seule source, deux images&nbsp;: l’image pour Home Assistant OS (`Dockerfile`, où bashio
lit les options de la configuration) et l’image autonome (`Dockerfile.standalone`, variables
d’environnement seulement). L’image autonome définit `AGENT_RUNTIME=docker`&nbsp;: c’est ce qui
fait que l’agent rédige ses consignes pour un conteneur et reste démarré après un refus, au lieu
de s’arrêter (`src/config.ts`, `src/index.ts`).

`npm test` lance la suite de tests&nbsp;: le client face à un relais en mémoire et à un faux Home
Assistant, la matrice de configuration des deux modes d’exécution, et la vérification que
`config.yaml` (la version qu’affiche le magasin) et `package.json` (la version que l’agent
annonce) portent le même numéro.

Hors de Home Assistant, l’agent tourne contre n’importe quelle instance&nbsp;: mettez dans
`HA_URL` son adresse (`http://ha.local:8123`), dans `HA_TOKEN` un jeton d’accès longue durée
créé depuis votre page de profil, dans `TUNNEL_URL` un relais et dans `PAIRING_CODE` un code,
puis lancez `npm run build && npm start`. `AGENT_DATA_DIR` déplace l’identifiant hors de `/data`.

`.github/workflows/builder.yml` lance les tests, construit et publie sur GHCR les images de
l’application Stratorama - Agent pour amd64 et aarch64 et l’image autonome multi-architecture à
chaque push sur `main`, puis vérifie qu’un inconnu peut les télécharger, la seule chose qu’une
image privée casse sans bruit. Les types du protocole, dans `src/types.ts`, doivent rester
alignés sur ceux du relais (`stratorama-tunnel/src/types.ts`).

## Licence

MIT, voir [LICENSE](LICENSE).
