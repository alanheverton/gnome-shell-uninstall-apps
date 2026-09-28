# Desinstalar aplicativos

Extensão para GNOME Shell 50 que adiciona a opção **Desinstalar** ao menu de contexto dos aplicativos na grade.

Suporta aplicativos Flatpak, RPM, AppImage e lançadores locais. Toda remoção exige confirmação.

## Instalação

```bash
git clone https://github.com/alanheverton/gnome-shell-uninstall-apps.git
mkdir -p ~/.local/share/gnome-shell/extensions/uninstall-apps@alanheverton
cp -r gnome-shell-uninstall-apps/work/uninstall-apps@alanheverton/{extension.js,appImage.js,metadata.json} \
  ~/.local/share/gnome-shell/extensions/uninstall-apps@alanheverton/
gnome-extensions enable uninstall-apps@alanheverton
```

Se necessário, encerre a sessão e entre novamente.
