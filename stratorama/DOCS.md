*La version française suit la version anglaise, plus bas. French version below the English one.*

# Stratorama

Your home's floor plan, with its devices on it, inside Home Assistant: draw the rooms, place the
lights, shutters, valves and sensors, and see and control them on the plan. **Everything stays in
your home**: the drawing, the devices and their states never leave it, and nothing here needs the
internet.

**Experimental**: this first version is for trying out. The plan you draw is kept, and moves with
the next versions.

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
- Who is in the home is Home Assistant's to say: there are no invitations, and to take somebody
  out, remove them from Home Assistant.

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

## What leaves your home

Nothing. The part that runs all the time reaches Home Assistant only through the agent's nine calls,
in MIT code you can read (`stratorama_agent` in this repository). The page, like every app's panel,
acts as you while you use it. Through Home Assistant Cloud, the panel's traffic crosses Nabu Casa's
relay, encrypted end to end, as all of Home Assistant's does.

To use Stratorama from anywhere through stratorama.app, "Take it online" will move a local home
there in a later version.

---

# Stratorama (français)

Le plan de votre maison, avec ses appareils dessus, dans Home Assistant&nbsp;: dessinez les pièces,
placez les lumières, volets, vannes et capteurs, puis voyez-les et pilotez-les sur le plan. **Tout
reste chez vous**&nbsp;: le dessin, les appareils et leurs états n’en sortent jamais, et rien ici n’a
besoin d’internet.

**Expérimental**&nbsp;: cette première version est faite pour essayer. Le plan que vous dessinez est
conservé et suit les versions suivantes.

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
- Qui fait partie de la maison, c’est Home Assistant qui le dit&nbsp;: il n’y a pas d’invitation, et pour
  retirer quelqu’un, retirez-le de Home Assistant.

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

## Ce qui sort de chez vous

Rien. La partie qui tourne en permanence ne rejoint Home Assistant que par les neuf appels de
l’agent, en code MIT que vous pouvez lire (`stratorama_agent` dans ce dépôt). La page, comme le
panneau de toute application, agit en votre nom pendant que vous l’utilisez. Par Home Assistant
Cloud, le trafic du panneau traverse le relais de Nabu Casa, chiffré de bout en bout, comme tout le
trafic de Home Assistant.

Pour utiliser Stratorama de partout via stratorama.app, «&nbsp;Passer en ligne&nbsp;» y déplacera une maison
locale dans une prochaine version.
