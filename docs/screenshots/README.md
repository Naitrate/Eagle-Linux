# Software-centre screenshots

These images are referenced by `packaging/eagle.metainfo.xml` and
`packaging/flatpak/cool.eagle.Eagle.metainfo.xml`, and are what Discover,
GNOME Software and other AppStream clients display for the app.

## Requirements

| | |
|---|---|
| Format | PNG |
| Size | 1600x1000 or similar 16:10 / 16:9; **at least 1000px wide** |
| Content | the window only — no desktop background, no other windows |
| Count | 3-5 |
| Privacy | use a throwaway/sample library; these are published publicly |

Keep one consistent theme across the set (dark or light, not mixed), and do
not add captions, arrows or marketing text to the images themselves — the
caption text lives in the metainfo XML.

Capture the window on its own (KDE Plasma, Wayland):

```bash
spectacle --activewindow --background --nonotify --output docs/screenshots/01-library.png
```

## Expected files

The metainfo expects these exact names. The first is the hero image shown in
list views, so make it the most representative.

| File | Should show |
|------|-------------|
| `01-library.png` | main library view — a grid of assets with the sidebar visible |
| `02-inspector.png` | an item selected, inspector open with tags, rating and metadata |
| `03-search.png` | filtering or colour search in action |
| `04-preview.png` | a preview: video, font or 3D asset |

Prefer shots of the Linux build as users actually see it, including the
port's own window controls. Do not reuse marketing imagery from eagle.cool:
it shows the macOS/Windows UI, it is the vendor's copyrighted material, and
this is an unofficial port.

## Setting a consistent window size

Eagle restores its geometry from `~/.config/Eagle/window-state.json`, so the
most reliable way to get identically-sized shots is to set it before launching
(with Eagle closed, or it will overwrite the file on exit):

```bash
python3 - <<PY
import json, pathlib
p = pathlib.Path.home() / ".config/Eagle/window-state.json"
s = json.loads(p.read_text())
s.update(width=1600, height=1000, isMaximized=False, isFullScreen=False)
p.write_text(json.dumps(s))
print("set to", s["width"], "x", s["height"])
PY
```

Then launch, and capture the window on its own:

```bash
spectacle --activewindow --background --nonotify --output docs/screenshots/01-library.png
```

`xdotool` also works while Eagle is running, since Electron 22 uses XWayland:

```bash
xdotool search --name "^Eagle$" windowsize 1600 1000
```

Note the window must stay larger than 700x700 or the compatibility layer skips
injecting the window controls, and the shots will not match a real install.

## Sample content for the demo library

Do not screenshot a personal library. Build a throwaway one from openly
licensed assets:

| Source | Licence | Good for |
|---|---|---|
| [Kenney](https://kenney.nl/assets) | CC0 | icons, UI kits, game art, 3D |
| [Openverse](https://openverse.org) (filter CC0) | CC0 | mixed media |
| [Rijksmuseum](https://www.rijksmuseum.nl/en/rijksstudio) / [Met Open Access](https://www.metmuseum.org/art/collection) | public domain | high-res artwork |
| [NASA Image Library](https://images.nasa.gov) | public domain | photography |
| [Unsplash](https://unsplash.com) / [Pexels](https://pexels.com) | permissive, no attribution required | photography, video |
| [unDraw](https://undraw.co) / [Open Doodles](https://opendoodles.com) | MIT / CC0 | illustrations |
| [Lucide](https://lucide.dev) / [Feather](https://feathericons.com) | ISC / MIT | icon sets |
| [Google Fonts](https://fonts.google.com) | OFL / Apache-2.0 | font previews |

CC0 and public-domain sources are the safest, since they carry no attribution
obligation at all. Unsplash and Pexels are fine for screenshots but their terms
do restrict redistributing large photo collections as a competing service.
