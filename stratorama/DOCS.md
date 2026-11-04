*La version française suit la version anglaise, plus bas. French version below the English one.*

# Stratorama

Your home's floor plan, with its devices on it, inside Home Assistant: draw the rooms, place the
lights, shutters, valves and sensors, and see and control them on the plan. **Everything stays in
your home**: the drawing, the devices and their states never leave it unless you take the home
online, and nothing here needs the internet.

**Experimental**: these first versions are for trying out. The plan you draw is kept through every
update.

## Requirements

- Home Assistant **OS**: Home Assistant apps (formerly called add-ons) need its Supervisor, version
  2026.10.3 or later (2026.10.4 tells administrators from the other users).
- A machine on **amd64** (x86-64) or **aarch64** (64-bit ARM: Raspberry Pi 4 and 5, Home Assistant
  Green and Yellow).

## First start

1. Install **Stratorama** from the Stratorama repository, the one that holds Stratorama - Agent, and
   start it. It puts itself in Home Assistant's sidebar.
2. Open **Stratorama** from the sidebar. The first administrator of Home Assistant to open it makes
   the home and owns it.
3. Draw your first room, then place your devices. Stratorama reaches Home Assistant by itself:
   there is nothing to pair, and Stratorama - Agent is not needed here.

## Who may do what

- Every Home Assistant user may open Stratorama. At their first visit, an administrator of Home
  Assistant may edit the plan; any other user sees it and controls the devices.
- Then the owner decides, in **Home settings > People**: who may edit the plan, who may switch the
  devices, and which floors and devices each person sees. A later change in Home Assistant does not
  change them.
- There are no invitations: to add someone, add them to Home Assistant. To keep someone out, the
  owner opens that person in **Home settings > People** and chooses **Remove from this home**: they
  can no longer open Stratorama, even from Home Assistant's sidebar, until the owner lets them back
  in from **Removed**, just below the list.

## On a wall tablet

- Open Stratorama in Home Assistant on the tablet. **This screen**, in Stratorama's menu, gives the
  steps for the Home Assistant Companion app on an iPad or on Android, for Safari, and for Fully
  Kiosk Browser.
- At home, Home Assistant's address is plain http, where no page can keep a screen on: the tablet
  does it, with the Companion app's Kiosk Mode and Keep screen on, its Keep screen on on Android,
  Auto-Lock at Never, or Fully's Keep Screen On.
- **Show the plan alone**, in This screen > Display, hides Home Assistant's sidebar and top bar on
  that screen.

## Backups

Home Assistant's backups hold Stratorama's data: before each backup, Stratorama writes a consistent
copy of its database, and a restore starts from it.

## A home as a file

- **Export**: **Account > Your data > Export as JSON** downloads the home as one file: its floors,
  rooms, walls and devices, with their links to Home Assistant's entities.
- **Import**: the owner can replace this home's plan with such a file, with **Import a home file**
  in **Home settings > General > Plan**. It can come from stratorama.app, where Home settings >
  Import / Export > **Export as JSON** makes it. The home keeps its name and its people, and the
  devices of a file from this same Home Assistant work at once.
- **Versions**: below the import, the last ten plans an import or a going back replaced, each to
  download, or to return to with **Go back**, which keeps the current plan first. Ordinary edits
  make none.

## Take it online

To open the home from anywhere without opening Home Assistant to the internet, the owner can put it
on stratorama.app as well, in **Home settings > General > Online**:

1. On stratorama.app, sign in or create an account whose home has no plan yet.
2. In its menu, under Home Assistant, open **Connection** and choose **Generate pairing code**.
3. Type that code in Stratorama, here, then choose **Take it online**. A code works once, within
   10 minutes.

The plan is copied to Stratorama's server once, and Home Assistant connects to the online home by
itself, through the agent built into Stratorama: there is nothing to install. From then on the two
plans are separate: a change to one does not reach the other, and the local home keeps working as
before, without the internet. To copy a plan across later, export it where it is and import it on
the other side.

## What leaves your home

Nothing, unless the owner takes the home online. The part that runs all the time reaches Home
Assistant only through the agent's nine calls, in MIT code you can read (`stratorama_agent` in this
repository). The page, like every app's panel, acts as you while you use it. Through Home Assistant
Cloud, the panel's traffic crosses Nabu Casa's relay, encrypted end to end, as all of Home
Assistant's does.

Once the home is online, its plan has been copied to stratorama.app, and the agent built into
Stratorama stays connected there, as Stratorama - Agent does: the states of the devices on the
online plan, and of those not on it yet while someone there has the device picker open, cross
Stratorama's relay, in memory, and only the same nine calls come back. How it works:
[stratorama.app/how-it-connects](https://stratorama.app/how-it-connects); what is kept there:
[stratorama.app/privacy](https://stratorama.app/privacy).

---

# Stratorama (français)

Le plan de votre maison, avec ses appareils dessus, dans Home Assistant&nbsp;: dessinez les pièces,
placez les lumières, volets, vannes et capteurs, puis voyez-les et pilotez-les sur le plan. **Tout
reste chez vous**&nbsp;: le dessin, les appareils et leurs états n’en sortent jamais, sauf si vous
passez la maison en ligne, et rien ici n’a besoin d’internet.

**Expérimental**&nbsp;: ces premières versions sont faites pour essayer. Le plan que vous dessinez est
conservé à chaque mise à jour.

## Prérequis

- Home Assistant **OS**&nbsp;: les applications Home Assistant (anciennement appelées modules
  complémentaires, ou add-ons) ont besoin de son Supervisor, en version 2026.10.3 ou plus récente
  (la 2026.10.4 distingue les administrateurs des autres utilisateurs).
- Une machine **amd64** (x86-64) ou **aarch64** (ARM 64 bits&nbsp;: Raspberry Pi 4 et 5, Home Assistant
  Green et Yellow).

## Premier démarrage

1. Installez **Stratorama** depuis le dépôt Stratorama, celui de Stratorama - Agent, puis
   démarrez-la. Elle s’ajoute d’elle-même à la barre latérale de Home Assistant.
2. Ouvrez **Stratorama** depuis la barre latérale. Le premier administrateur de Home Assistant qui
   l’ouvre crée la maison et en devient le propriétaire.
3. Dessinez votre première pièce, puis placez vos appareils. Stratorama rejoint Home Assistant
   d’elle-même&nbsp;: rien à appairer, et Stratorama - Agent n’est pas nécessaire ici.

## Qui peut faire quoi

- Tout utilisateur de Home Assistant peut ouvrir Stratorama. À sa première visite, un administrateur
  de Home Assistant peut modifier le plan&nbsp;; tout autre utilisateur le voit et pilote les appareils.
- Ensuite, le propriétaire décide, dans **Paramètres de la maison > Personnes**&nbsp;: qui peut modifier
  le plan, qui peut allumer et éteindre les appareils, quels étages et quels appareils chacun voit.
  Un changement ultérieur dans Home Assistant ne les modifie pas.
- Il n’y a pas d’invitation&nbsp;: pour ajouter quelqu’un, ajoutez-le à Home Assistant. Pour écarter
  quelqu’un, le propriétaire ouvre sa fiche dans **Paramètres de la maison > Personnes** et choisit
  **Retirer de cette maison**&nbsp;: cette personne ne peut plus ouvrir Stratorama, même depuis la
  barre latérale de Home Assistant, jusqu’à ce que le propriétaire la réintègre depuis **Personnes
  retirées**, juste sous la liste.

## Sur une tablette murale

- Ouvrez Stratorama dans Home Assistant sur la tablette. **Cet écran**, dans le menu de Stratorama,
  donne les étapes pour l’application Home Assistant Companion sur iPad ou sur Android, pour Safari
  et pour Fully Kiosk Browser.
- Chez vous, l’adresse de Home Assistant est en http simple, où aucune page ne peut garder un écran
  allumé&nbsp;: c’est la tablette qui s’en charge, avec le mode kiosque de l’application Companion et
  Garder l’écran allumé, son Garder l’écran allumé sur Android, le verrouillage automatique sur
  Jamais, ou le Keep Screen On de Fully.
- **Afficher le plan seul**, dans Cet écran > Affichage, masque la barre latérale et la barre
  supérieure de Home Assistant sur cet écran.

## Sauvegardes

Les sauvegardes de Home Assistant contiennent les données de Stratorama&nbsp;: avant chaque sauvegarde,
Stratorama écrit une copie cohérente de sa base, et une restauration repart de cette copie.

## Une maison en fichier

- **Exporter**&nbsp;: **Compte > Vos données > Exporter en JSON** télécharge la maison en un seul
  fichier&nbsp;: ses étages, ses pièces, ses murs et ses appareils, avec leurs liens vers les entités
  de Home Assistant.
- **Importer**&nbsp;: le propriétaire peut remplacer le plan de cette maison par un tel fichier, avec
  **Importer un fichier de maison** dans **Paramètres de la maison > Général > Plan**. Il peut venir
  de stratorama.app, où Paramètres de la maison > Import / Export > **Exporter en JSON** le crée. La
  maison garde son nom et ses personnes, et les appareils d’un fichier venu de ce même Home Assistant
  fonctionnent aussitôt.
- **Versions**&nbsp;: sous l’import, les dix derniers plans qu’un import ou un retour a remplacés,
  chacun à télécharger, ou à retrouver avec **Revenir**, qui conserve d’abord le plan actuel. Les
  modifications ordinaires n’en créent pas.

## Passer en ligne

Pour ouvrir la maison de partout sans ouvrir Home Assistant à internet, le propriétaire peut aussi
la mettre sur stratorama.app, dans **Paramètres de la maison > Général > En ligne**&nbsp;:

1. Sur stratorama.app, connectez-vous ou créez un compte dont la maison n’a pas encore de plan.
2. Dans son menu, sous Home Assistant, ouvrez **Connexion** et choisissez **Générer un code
   d’appairage**.
3. Saisissez ce code dans Stratorama, ici, puis choisissez **Passer en ligne**. Un code ne sert
   qu’une fois, dans les 10&nbsp;minutes.

Le plan est copié une fois sur le serveur de Stratorama, et Home Assistant se connecte de lui-même
à la maison en ligne, par l’agent intégré à Stratorama&nbsp;: rien à installer. Dès lors, les deux
plans sont indépendants&nbsp;: une modification de l’un n’atteint pas l’autre, et la maison locale
continue de fonctionner comme avant, sans internet. Pour copier plus tard un plan d’un côté à
l’autre, exportez-le là où il est et importez-le de l’autre côté.

## Ce qui sort de chez vous

Rien, sauf si le propriétaire passe la maison en ligne. La partie qui tourne en permanence ne
rejoint Home Assistant que par les neuf appels de l’agent, en code MIT que vous pouvez lire
(`stratorama_agent` dans ce dépôt). La page, comme le panneau de toute application, agit en votre
nom pendant que vous l’utilisez. Par Home Assistant Cloud, le trafic du panneau traverse le relais
de Nabu Casa, chiffré de bout en bout, comme tout le trafic de Home Assistant.

Une fois la maison en ligne, son plan a été copié sur stratorama.app, et l’agent intégré à
Stratorama y reste connecté, comme le fait Stratorama - Agent&nbsp;: les états des appareils du plan
en ligne, et ceux des appareils qui n’y sont pas encore quand quelqu’un y ouvre le sélecteur
d’entités, traversent le relais de Stratorama, en mémoire, et seuls les mêmes neuf appels
reviennent. Comment cela fonctionne&nbsp;:
[stratorama.app/fr/how-it-connects](https://stratorama.app/fr/how-it-connects)&nbsp;; ce qui y est
conservé&nbsp;: [stratorama.app/fr/privacy](https://stratorama.app/fr/privacy).
