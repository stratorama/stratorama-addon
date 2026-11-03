# Changelog

## 0.1.5

- The owner can now remove a person, in Home settings > People: they can no longer open Stratorama,
  even from Home Assistant's sidebar, until the owner lets them back in from the list of people
  removed, just below.
- The device picker shows every device's value on its right, so "Show value" is gone, and lists the
  devices of the element's room first.
- A sensor that reports a date or a time shows it in Stratorama's language.

## 0.1.4

- A screen left open on Stratorama now picks up a new version by itself: once nobody has touched it
  for 5 minutes, it reloads onto it. Reload each screen by hand once, to this version; the next
  ones reach it alone.

## 0.1.3

- The plan now runs to the very edges of the screen, and only the controls keep clear of them: 0.1.1
  and 0.1.2 still stopped the plan above the bottom edge, so the dark band stayed.

## 0.1.2

- No more dark band along the bottom of the screen without the plan alone either: Stratorama keeps
  clear of the screen's edges itself, whether Home Assistant's sidebar shows or not.
- Once the controls have faded, the plan rests at the centre of the screen.

## 0.1.1

- With the plan alone on a tablet, no more dark band along the bottom of the screen: Home Assistant
  now leaves the screen's edges to Stratorama, which keeps the plan clear of them. And when the
  tablet wakes, Stratorama hides Home Assistant's bars again at once.
- The controls fade after ten seconds without a touch, as on stratorama.app, and come back at the
  next one.

## 0.1.0

- First version, experimental: Stratorama inside Home Assistant, the plan and its devices kept in
  your home. Opened from Home Assistant's sidebar by every Home Assistant user, the owner managing
  their rights; the agent built in, nothing to pair; Home Assistant's backups included.
