# Blender character assets

`player.glb` is generated locally with Blender 5.2 from `tools/generate_avatar.py`.
It is an original, pastel, contemporary Chinese-animation-inspired resident
with a balanced adult silhouette, warm East-Asian palette, almond eyes,
deep tea-brown layered hair, warm peach skin, a modern Chinese-style daily
outfit, separate clothing and face materials, and a deterministic humanoid
armature. The reference material guides the friendly proportions, colors, and
mood; it is not copied as meshes or textures. The design uses cultural styling
and original wardrobe details rather than claiming that nationality can be
identified from a face shape.

Regenerate it with:

```powershell
blender -b --python tools/generate_avatar.py
```

Place the exported web-ready character at `public/assets/characters/player.glb`, then run the game and call:

```js
await window.__game.loadBlenderAvatar()
```

The loader accepts a skinned GLB with optional clips named `Idle`, `Walk` or `Run`. It normalizes the model to a 2.35-unit character height, corrects Blender's common Z-up armature conversion when the source bounds are horizontal, moves the feet to ground level, enables shadows, and keeps the procedural character as the fallback when the file is missing or invalid.

Recommended Blender export settings:

- glTF 2.0 Binary (`.glb`)
- Apply transforms before export
- Armature and mesh included; animations enabled
- Material slots preserved; base-color textures in sRGB
- Keep the player asset below roughly 15 MB for browser delivery
- Use a separate low-detail export for mobile once the high-detail version is approved

Bone names are matched heuristically for mounted pose support. For reliable animation, name clips `Idle` and `Walk` or `Run`.
