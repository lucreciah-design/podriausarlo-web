# podriausarlo — guía de puesta en marcha

Todo lo que sigue lo hacés una sola vez. Después, para cargar prendas del día a día, solo entrás a tu web y usás el panel.

## 1. Crear el proyecto en Firebase

1. Andá a https://console.firebase.google.com y creá un proyecto nuevo (ej. "podriausarlo").
2. No hace falta habilitar Google Analytics para esto.

## 2. Activar Firestore (la base de datos del catálogo)

1. En el menú izquierdo: **Build > Firestore Database > Crear base de datos**.
2. Elegí **modo producción** (no "modo de prueba").
3. Ubicación sugerida: `southamerica-east1` (San Pablo, la más cercana a Argentina).

## 3. Activar Authentication (tu login) y crear tu usuario

1. **Build > Authentication > Get started**.
2. En "Sign-in method", habilitá **Email/Password**.
3. En la pestaña **Users**, hacé clic en **Add user** y creá tu usuario: tu mail y una contraseña. Ese va a ser tu login para entrar al panel.

Nota: no usamos Firebase Storage para las fotos — desde 2026 Firebase pide tarjeta de crédito para eso. En cambio, las fotos se guardan comprimidas directamente en Firestore, así que no hace falta activar Storage para nada.

## 4. Reglas de seguridad (importante, no te lo saltees)

Por defecto Firebase puede quedar totalmente cerrado o totalmente abierto — ninguna de las dos sirve. Necesitás que **cualquiera pueda ver el catálogo**, pero que **solo vos puedas cargar, editar o borrar**.

En **Firestore Database > Reglas**, reemplazá el contenido por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /prendas/{prendaId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

Hacé clic en **Publicar**.

## 5. Conectar el código con tu proyecto de Firebase

1. En Firebase: **Configuración del proyecto (el ícono de engranaje) > Tus apps > agregar app > ícono web </>**.
2. Ponele un nombre y creá la app (no hace falta Firebase Hosting).
3. Te va a mostrar un bloque `firebaseConfig` con varios valores.
4. Copiá esos valores dentro del archivo **`firebase-config.js`** de esta carpeta, reemplazando los `"TU_..."`.

## 6. Subir el proyecto a GitHub

Con tu experiencia previa esto ya lo conocés: creá un repo nuevo y subí los 4 archivos (`index.html`, `style.css`, `app.js`, `firebase-config.js`).

## 7. Conectar con Netlify

1. En Netlify: **Add new site > Import an existing project > GitHub** y elegí el repo.
2. Como es HTML simple, dejá **build command vacío** y **publish directory** en la raíz (`/` o vacío).
3. Deploy. Netlify te va a dar un link (algo como `podriausarlo.netlify.app`).

## 8. Probar todo

1. Abrí el link de Netlify.
2. Tocá el ícono chiquito de la esquina superior derecha.
3. Iniciá sesión con el mail y contraseña que creaste en el paso 3.
4. Cargá una prenda de prueba con una foto y confirmá que aparece en la vidriera.
5. Cerrá sesión y confirmá que, sin loguearte, no podés entrar al panel — solo ver el catálogo.

## 9. Más adelante (opcional)

- **Dominio propio**: en Netlify, Domain settings, podés conectar un dominio como podriausarlo.com si en algún momento lo comprás.
- **Reusar esto para otro rubro**: los nombres de marca, colores, tagline y el número de WhatsApp están agrupados arriba de todo en `style.css` (colores) y `app.js` (WhatsApp y mensaje) — cambiando esas pocas líneas, esta misma base sirve para otro negocio.

## Si algo no funciona

- Si las prendas no aparecen: revisá que las reglas de Firestore estén publicadas tal cual el paso 4.
- Si el login no funciona: confirmá que el usuario esté creado en Authentication > Users con el mismo mail que estás probando.
- Si al guardar una prenda con fotos te tira error: probá con menos fotos o fotos más chicas — Firestore tiene un límite de 1 MB por prenda guardada.
