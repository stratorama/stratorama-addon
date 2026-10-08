*La version française suit la version anglaise, plus bas. French version below the English one.*

# Stratorama - Agent

Links your Home Assistant to your [Stratorama](https://stratorama.app) account through a
single **outbound** connection, so you can see and control your devices on a floor plan
from anywhere without exposing Home Assistant to the internet.

## Requirements

- Home Assistant **OS**. Home Assistant apps (formerly called add-ons) need its Supervisor;
  an older **Supervised** install runs them too, though Home Assistant no longer supports it.
- A machine on **amd64** (x86-64) or **aarch64** (64-bit ARM: Raspberry Pi 4 and 5, Home
  Assistant Green and Yellow, most NUC-class boxes). 32-bit ARM (armv7) is not supported.
- A Stratorama account: https://stratorama.app.

## Setup

1. In Stratorama, open the settings menu (the three-dot menu, top right), then **Home Assistant >
   Connection**, and press **Generate pairing code**. You get an 8-character code, valid for
   10 minutes.
2. In this app's **Configuration** tab, paste the code into **Pairing code** and press
   **Save**. Leave **Tunnel URL** at its default. Home Assistant shows no message after a
   save, and none is needed: the code is saved (if the app is already running, Home Assistant
   asks to restart it: press **Restart**).
3. Back on the **Info** tab, **Start** the app. Within a few seconds the Connection panel in
   Stratorama shows **Connected**, and the small Home Assistant mark in the top-right corner of
   the plan turns green.

That is all. The app now holds its own long-lived credential (stored in its `/data`
folder), so restarts and Home Assistant updates reconnect on their own. You can clear the
**Pairing code** field afterwards; it is never needed again unless you disconnect.

## What the app does, and what leaves your home

- It opens one outbound WebSocket to `wss://stratorama.app/agent`. **No port is opened** on
  your network, and Home Assistant is never reachable from the internet through it.
- Through that connection, Stratorama's server asks Home Assistant for the **state of your
  entities** (`GET /api/states`) and sends **service calls for the devices you placed on
  your plan**: lights, switches and covers - turn on, turn off, set brightness and colour,
  open, close, stop, set position. The app itself refuses any other call, whoever asks.
- It also forwards the **state changes of the entities on your plan** - its devices, their
  readings, your doors' sensors and your device library - and of nothing else: everything not
  on your plan stays in your home, and only lights, switches, covers, sensors and binary
  sensors ever leave it, so people and device trackers (who is home, where each phone is),
  cameras and media players never do. When an editor opens Stratorama's device picker, the
  other lights, switches, covers and sensors are listed **by name, kind and unit only**, with
  no value; pressing Show value reads one of them, once. What it does forward travels through
  Stratorama's server **in memory only**: it is never written to disk there, and each browser
  or wall panel is only sent the entities that are actually bound to its plan.
- It never reads your history or logbook, never touches automations, and never sends
  Home Assistant credentials anywhere: the Supervisor gives the app a local token that
  stays inside the app. The tokens Home Assistant itself puts in some states (an
  `access_token`, the `?token=` of a camera's picture link, a stream token) are removed, in
  the forms Home Assistant writes them, before a state leaves your home, even from a sensor
  that copies such a link.

The full statement is in Stratorama's privacy policy: https://stratorama.app/privacy.

## Disconnecting

In Stratorama, **Menu > Home Assistant > Connection > Disconnect Home Assistant** revokes
the credential immediately: the connection drops within a second and the app cannot
reconnect until it is paired again with a fresh code. Uninstalling the app removes its
`/data` folder and the credential with it.

## Troubleshooting

Open the app's **Log** tab. When the app stops on purpose (the first three items),
Home Assistant shows it as stopped with an error: nothing will change until the
configuration does, so it does not keep knocking on the relay every minute.

- **"Pairing refused: ..."** - the pairing code is unknown, already used, or older than 10
  minutes. Generate a new one in Stratorama (Menu > Home Assistant > Connection), paste
  it into Pairing code, save, then start the app.
- **"The relay no longer accepts this agent's credential"** - somebody pressed Disconnect
  Home Assistant in Stratorama, or paired another Home Assistant to the same home. Same fix;
  if a fresh code is already in the configuration, the app tries it by itself.
- **"No stored credential and no pairing code in the configuration"** - first start
  without a code. Same fix.
- **The app says Running but Stratorama says Not connected** - a repeating
  `Relay WS error` line means the app cannot reach `stratorama.app` on port 443: check
  your firewall or DNS. The app retries on its own, up to once a minute.
- **"No frame from the relay for 90 s"** - the network dropped the connection silently;
  the app reconnects by itself. Only worth a look if it repeats every few minutes.
- **"Refusing ha:request ... not one of the calls this agent relays"** - Stratorama asked
  for something this version does not relay: update the app.
- **The store shows the app as "Not available"** - your machine is 32-bit (armv7) or
  i386, which the images do not cover.
- **Installation fails while downloading the image** - a transient registry problem;
  retry in a minute. If it persists, open an issue (below).

## Support

- Issues: https://github.com/stratorama/stratorama-addon/issues
- Email: contact@stratorama.app

The app is open source under the MIT licence: https://github.com/stratorama/stratorama-addon.

---

# Version française

L’application Stratorama - Agent relie votre Home Assistant à votre compte
[Stratorama](https://stratorama.app/fr) par une seule connexion **sortante**&nbsp;: vous voyez
et commandez vos appareils sur un plan, où que vous soyez, sans exposer Home Assistant à
Internet.

## Prérequis

- Home Assistant **OS**&nbsp;: une application Home Assistant
  (anciennement appelée module complémentaire, ou add-on) a besoin de son Supervisor. Une
  ancienne installation **Supervised** en fait aussi tourner, même si Home Assistant ne la
  prend plus en charge.
- Une machine **amd64** (x86-64) ou **aarch64** (ARM 64&nbsp;bits&nbsp;: Raspberry Pi 4 et 5,
  Home Assistant Green et Yellow, la plupart des mini-PC de type NUC). L’ARM 32&nbsp;bits
  (armv7) n’est pas pris en charge.
- Un compte Stratorama&nbsp;: https://stratorama.app/fr.

## Mise en place

1. Dans Stratorama, ouvrez le menu (les trois points, en haut à droite), puis
   **Home Assistant > Connexion** et appuyez sur **Générer un code d’appairage**. Vous obtenez
   un code de 8&nbsp;caractères, valable 10&nbsp;minutes.
2. Dans l’onglet **Configuration** de l’agent, collez le code dans **Code d’appairage**
   (**Pairing code** si le champ s’affiche en anglais) et appuyez sur **Enregistrer**. Laissez
   **URL du tunnel** (**Tunnel URL**) à sa valeur par défaut. Home Assistant n’affiche aucun
   message après l’enregistrement, et c’est normal&nbsp;: le code est enregistré (si l’agent
   tourne déjà, Home Assistant demande «&nbsp;Redémarrer Stratorama - Agent&nbsp;?&nbsp;»&nbsp;:
   appuyez sur **Redémarrer**).
3. De retour dans l’onglet **Info**, appuyez sur **Démarrer**. En quelques secondes, la fenêtre
   de connexion de Stratorama affiche **Connecté**, et le petit logo Home Assistant en haut à
   droite du plan passe au vert.

C’est tout. L’agent détient désormais son propre identifiant de longue durée (enregistré dans
son dossier `/data`)&nbsp;: il se reconnecte tout seul après un redémarrage ou une mise à jour
de Home Assistant. Vous pouvez ensuite vider le champ **Code d’appairage**&nbsp;; il ne
resservira qu’après une déconnexion.

## Ce que fait l’agent, et ce qui sort de chez vous

- Il ouvre une seule connexion WebSocket sortante vers `wss://stratorama.app/agent`. **Aucun port
  n’est ouvert** sur votre réseau, et Home Assistant n’est jamais joignable depuis Internet par
  ce biais.
- Par cette connexion, le serveur de Stratorama demande à Home Assistant **l’état de vos
  entités** (`GET /api/states`) et envoie des **appels de service pour les appareils placés sur
  votre plan**&nbsp;: lumières, interrupteurs et volets (allumer, éteindre, régler la luminosité
  et la couleur, ouvrir, fermer, arrêter, régler la position). L’agent refuse lui-même tout
  autre appel, d’où qu’il vienne.
- Il transmet aussi les **changements d’état des entités de votre plan** (ses appareils, leurs
  relevés, les capteurs de vos portes et votre bibliothèque d’appareils), et rien d’autre&nbsp;:
  tout ce qui n’est pas sur votre plan reste chez vous, et seuls cinq types d’entités peuvent
  en sortir&nbsp;: lumières, interrupteurs, volets, capteurs et capteurs binaires. Les personnes
  et la localisation des appareils (qui est à la maison, où se trouve chaque téléphone), les
  caméras et les lecteurs multimédias n’en sortent donc jamais. Quand une personne pouvant
  modifier le plan ouvre le sélecteur d’entités de Stratorama, les autres lumières,
  interrupteurs, volets et capteurs y sont listés **par nom, type et unité seulement**, sans
  valeur&nbsp;; **Voir la valeur** lit celle de l’un d’eux, une seule fois. Ce que l’agent transmet traverse le
  serveur de Stratorama **uniquement en mémoire**&nbsp;: rien n’y est écrit sur disque, et chaque
  navigateur ou tablette murale ne reçoit que les entités réellement liées à son plan.
- Il ne lit jamais l’**Historique** ni l’**Activité** de Home Assistant, ne touche jamais aux
  automatisations et n’envoie jamais d’identifiants Home Assistant nulle part&nbsp;: le
  Supervisor donne à l’agent un jeton local qui ne quitte pas l’agent. Les jetons que Home
  Assistant place lui-même dans certains états (un `access_token`, le `?token=` du lien d’image
  d’une caméra, un jeton de flux) sont retirés, sous les formes où Home Assistant les écrit,
  avant qu’un état ne quitte votre maison, même d’un capteur qui recopie un tel lien.

Le détail figure dans la politique de confidentialité de Stratorama&nbsp;:
https://stratorama.app/fr/privacy.

## Déconnexion

Dans Stratorama, **Menu > Home Assistant > Connexion > Déconnecter Home Assistant** révoque
aussitôt l’identifiant de l’agent&nbsp;: la connexion tombe en moins d’une seconde, et l’agent
ne peut plus se reconnecter tant qu’il n’est pas réappairé avec un nouveau code. Désinstaller
l’agent supprime son dossier `/data`, et l’identifiant avec.

## Dépannage

Ouvrez l’onglet **Journal** de l’agent&nbsp;: ses messages sont en anglais, et les principaux
sont expliqués ci-dessous. Quand l’agent s’arrête volontairement (les trois premiers cas), Home
Assistant l’affiche comme arrêté, en erreur&nbsp;: rien ne changera tant que la configuration
n’aura pas changé, c’est pourquoi il ne réessaie pas auprès du relais toutes les minutes.

- `Pairing refused: ...`&nbsp;: l’appairage est refusé, parce que le code est inconnu, déjà
  utilisé ou vieux de plus de 10&nbsp;minutes. Générez-en un nouveau dans Stratorama
  (Menu > Home Assistant > Connexion), collez-le dans **Code d’appairage**, enregistrez, puis
  démarrez l’agent.
- `The relay no longer accepts this agent's credential`&nbsp;: le relais n’accepte plus
  l’identifiant de l’agent. Quelqu’un a appuyé sur **Déconnecter Home Assistant** dans
  Stratorama, ou a appairé un autre Home Assistant à la même maison. Même solution&nbsp;; si un
  nouveau code est déjà dans la configuration, l’agent l’essaie de lui-même.
- `No stored credential and no pairing code in the configuration`&nbsp;: aucun identifiant
  enregistré et aucun code d’appairage dans la configuration, autrement dit un premier
  démarrage sans code. Même solution.
- **L’agent est «&nbsp;En cours d’exécution&nbsp;», mais Stratorama affiche «&nbsp;Non
  connecté&nbsp;»**&nbsp;: une ligne `Relay WS error` répétée (erreur de connexion au relais)
  signifie que l’agent ne joint pas `stratorama.app` sur le port 443. Vérifiez votre pare-feu
  ou votre DNS. L’agent réessaie de lui-même, au plus une fois par minute.
- `No frame from the relay for 90 s`&nbsp;: aucune trame du relais depuis 90&nbsp;secondes, car
  le réseau a coupé la connexion sans prévenir. L’agent se reconnecte de lui-même&nbsp;; ce n’est
  à surveiller que si ce message revient à quelques minutes d’intervalle.
- `Refusing ha:request ... not one of the calls this agent relays`&nbsp;: Stratorama a demandé
  quelque chose que cette version de l’agent ne relaie pas. Mettez l’agent à jour.
- **Le magasin d’applications affiche l’agent «&nbsp;Non disponible&nbsp;»**&nbsp;: votre
  machine est en 32&nbsp;bits (armv7) ou i386, que les images ne couvrent pas.
- **L’installation échoue pendant le téléchargement de l’image**&nbsp;: un incident passager du
  registre d’images. Réessayez une minute plus tard&nbsp;; si cela persiste, signalez-le (voir
  Assistance, ci-dessous).

## Assistance

- Signaler un problème&nbsp;: https://github.com/stratorama/stratorama-addon/issues
- Email&nbsp;: contact@stratorama.app

L’agent est open source, sous licence MIT&nbsp;: https://github.com/stratorama/stratorama-addon.
