import json

# Carica il file JSON della navmesh
with open('navmesh_clean.json', 'r') as f:
    navmesh = json.load(f)

# Inverti l'ordine dei vertici per OGNI poligono
for poly in navmesh['polygons']:
    poly['vertices'] = poly['vertices'][::-1]  # Inversione completa

# Salva la versione corretta
with open('navmesh_ccw.json', 'w') as f:
    json.dump(navmesh, f, indent=2)

print("✓ Navmesh corretta! Salvata come 'navmesh_ccw.json'")
print(f"  Poligoni elaborati: {len(navmesh['polygons'])}")
