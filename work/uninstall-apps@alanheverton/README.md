# Desinstalar aplicativos

Extensão para GNOME Shell 50 que adiciona **Desinstalar** ao menu de contexto da grade de aplicativos.

- RPM: remove pelo PackageKit (`pkcon`) e informa sucesso ou falha.
- Flatpak: remove pela ferramenta oficial `flatpak` e informa sucesso ou falha.
- AppImage: usa a ação `Uninstall` do lançador ou move o AppImage e seu lançador local para a lixeira.
- Aplicativos locais: move para a lixeira somente arquivos dentro da pasta pessoal.
- Toda remoção exige confirmação.

## Instalação

```bash
gnome-extensions install --force uninstall-apps@alanheverton.shell-extension.zip
gnome-extensions enable uninstall-apps@alanheverton
```

Se a extensão ainda não aparecer na sessão Wayland atual, encerre a sessão e entre novamente uma vez.
