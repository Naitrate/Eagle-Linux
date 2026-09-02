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
