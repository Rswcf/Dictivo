# Dictivo

[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | Español

> ⚠️ Esta traducción al español es una versión resumida del README en inglés. Consulta el [README en inglés](../README.md) para la explicación completa. PRs de traducción bienvenidos.

Dictivo es una app de dictado local-first para macOS y Windows. Convierte voz en texto con un motor `whisper.cpp` ejecutado en el dispositivo, pensada para personas que quieren dictado rápido, privacidad real, snippets reutilizables, historial local y pegado directo en la app activa.

## Por qué Dictivo

| Necesidad | Enfoque de Dictivo |
| --- | --- |
| Dictar rápido | Usa el atajo global, habla, detén la grabación y pega el texto. |
| Mantener privacidad | Audio, transcripciones, diccionario, snippets e historial permanecen en tu dispositivo. |
| Obtener texto listo para pegar | Dictivo genera un mensaje normal por defecto; ajusta puntuación, muletillas y mayúsculas en `Settings -> Local Engine -> Processing toggles`. |
| Reutilizar texto frecuente | Guarda términos locales, nombres, enlaces y frases repetidas. |
| Adaptarse al hardware | Selecciona Fast, Medium o Quality según tu equipo. |

## Inicio rápido

Cuando los builds estén publicados, descarga la última versión desde GitHub Releases:

- macOS: `Dictivo.app` o `.dmg`
- Windows: usa el instalador `.exe` para el usuario actual; usa `.msi` para despliegues administrados

Abre Dictivo y ve a `Settings -> Local Engine` para descargar o importar un modelo local.

Ejecutar desde código fuente:

```bash
npm install
npm run tauri:dev -w @dictivo/desktop
```

Vista previa solo del frontend en navegador:

```bash
npm run dev
```

## Primer dictado

1. Abre `Settings -> Local Engine`.
2. Descarga o importa un modelo `.bin`.
3. Acepta los permisos de micrófono y accesibilidad cuando el sistema los solicite.
4. Pulsa `CommandOrControl+Shift+Space` para empezar a grabar.
5. Habla de forma natural.
6. Pulsa el mismo atajo para detener la grabación.
7. Dictivo transcribe localmente, copia el texto final e intenta pegarlo en la app activa.

Si el sistema bloquea el pegado automático, el texto sigue copiado. Usa `Command+V` en macOS o `Ctrl+V` en Windows.

## Solución de problemas

| Problema | Qué revisar |
| --- | --- |
| No graba | Confirma el permiso de micrófono y reinicia Dictivo. |
| No aparece ningún modelo local | Descarga o importa un modelo `.bin` en `Settings -> Local Engine`. |
| Copia pero no pega | En macOS, confirma el permiso de accesibilidad, enfoca el campo de texto de destino y pulsa `Command+V`. |
| El atajo global no responde | Cambia el atajo en `Settings -> Hotkeys` si otra app ya lo usa. |
| La primera transcripción tarda mucho | Prueba primero con un modelo pequeño y cambia luego a uno de mayor calidad. |

## Motor local

Los builds de escritorio incluyen la estructura esperada del motor Private Fast. Al ejecutar desde código fuente, empieza con un modelo pequeño para validar permisos, atajos y latencia:

```bash
DICTIVO_MODEL=small scripts/setup-private-fast.sh
```

Para más calidad local en equipos capaces:

```bash
DICTIVO_MODEL=large-v3-turbo-q5_0 scripts/setup-private-fast.sh
```

Sobrescrituras opcionales:

```bash
DICTIVO_PRIVATE_FAST_HOME=/path/to/private-fast
DICTIVO_WHISPER_CLI=/path/to/whisper-cli
DICTIVO_WHISPER_MODEL=/path/to/model.bin
```

## Modelo de privacidad

Dictivo está diseñado como local-first. La app de escritorio no llama APIs de IA en la nube para dictado.

El backend nunca debe recibir ni guardar:

- blobs de audio o URLs de audio
- texto transcrito
- resúmenes de reuniones
- términos del diccionario
- snippets
- credenciales de proveedores
- API keys

El backend solo acepta metadatos, como session IDs locales, nombre del proveedor, modo de privacidad, duración y recuento de palabras.

## Idiomas compatibles

La app actualmente incluye ajustes de dictado local para:

- English
- 中文
- Español
- 日本語
- Français
- Deutsch
- Tiếng Việt

La documentación de GitHub está disponible en English, 简体中文, 日本語 y Español. Aceptamos traducciones de la comunidad.

## Atajos

| Atajo | Acción |
| --- | --- |
| `CommandOrControl+Shift+Space` | Iniciar o detener dictado |
| `CommandOrControl+Shift+V` | Pegar la última transcripción |

Los atajos se pueden cambiar en `Settings -> Hotkeys`.

## Comandos de desarrollo

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run e2e
npm run test:coverage
npm run build
```

Comandos nativos de escritorio:

```bash
npm run tauri:dev -w @dictivo/desktop
npm run tauri:build -w @dictivo/desktop
```

## Roadmap

- Publicar builds firmados para macOS y Windows.
- Agregar capturas del producto y clips cortos de demo al README.
- Ampliar pruebas E2E nativas para permisos de micrófono, atajos globales y ejecución de modelos locales.
- Agregar más traducciones de la comunidad.

## Comunidad

- Preguntas y ayuda de instalación: usa GitHub Discussions cuando el repositorio sea público.
- Bugs: abre un GitHub Issue con sistema operativo, versión de la app, modelo local y pasos de reproducción.
- Seguridad o privacidad: no publiques logs sensibles; usa el contacto de seguridad del repositorio cuando esté configurado.
- Traducciones: abre un pull request que actualice el archivo `docs/README.<locale>.md` correspondiente.
