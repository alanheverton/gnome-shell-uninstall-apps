# Uninstall Apps

A GNOME Shell 50 extension that adds an **Uninstall** option to app context menus in the application grid.

It supports Flatpak, RPM, AppImage, and local app launchers. Every removal requires confirmation.

## Installation

```bash
git clone https://github.com/alanheverton/gnome-shell-uninstall-apps.git
mkdir -p ~/.local/share/gnome-shell/extensions/uninstall-apps@alanheverton
cp -r gnome-shell-uninstall-apps/work/uninstall-apps@alanheverton/{extension.js,appImage.js,metadata.json} \
  ~/.local/share/gnome-shell/extensions/uninstall-apps@alanheverton/
gnome-extensions enable uninstall-apps@alanheverton
```

Log out and back in if the extension is not loaded immediately.
