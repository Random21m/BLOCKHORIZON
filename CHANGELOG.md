# Changelog

What changed in each version of BLOCKHORIZON, newest first. The version is shown at the bottom of the app.

## 0.17.0

- **Choose your dashboard.** A new Dashboard tab in Settings lets you hide the tiles you do not need and put the rest
  in your own order. The projected and recent block rows can be hidden too. The old "Show fees and mempool" switch is
  now part of this list (if you had it off, nothing changes for you).
- **Faster first load.** Only the language you use is downloaded, not all of them: about a quarter less to load.
- **Block rows show there is more.** A row of blocks with more out of view fades out at that edge, and on a computer
  the mouse wheel scrolls it sideways.
- **Moscow time explained.** Hovering over it (or a screen reader) explains the clock-like number, and it links to
  the glossary.
- **Alarms on your phone, on your node.** On Umbrel, StartOS or the container with your own mempool, the Alarm page
  can send your block, fee and price alarms to your phone through [ntfy](https://ntfy.sh), even when no browser has
  BLOCKHORIZON open: your node watches them and sends each once, in your language.
- On narrow phones the Settings tabs wrap onto a second row instead of being cut off.

Earlier versions: see the [commit history](https://github.com/Random21m/BLOCKHORIZON/commits/main).
