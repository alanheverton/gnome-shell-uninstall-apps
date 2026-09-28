# Desinstalar aplicativos

Extensão para GNOME Shell 50 que adiciona **Desinstalar** ao menu de contexto da grade de aplicativos.

- RPM e Flatpak: abre o fluxo de remoção do GNOME Software.
- AppImage: usa a ação `Uninstall` do lançador ou move o AppImage e seu lançador local para a lixeira.
- A remoção continua exigindo a confirmação normal do sistema ou do gerenciador de AppImages.

## Instalação

```bash
gnome-extensions install --force uninstall-apps@alanheverton.shell-extension.zip
gnome-extensions enable uninstall-apps@alanheverton
```

Se a extensão ainda não aparecer na sessão Wayland atual, encerre a sessão e entre novamente uma vez.
