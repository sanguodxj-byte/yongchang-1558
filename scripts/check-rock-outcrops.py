"""Check rendered mineral geometry against terrain, resource cells and the old map."""
import argparse
import hashlib
import json
import sys
import zlib
from collections import Counter
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='.build/rock-repair/outcrops.json')
parser.add_argument('--baseline', type=Path)
args = parser.parse_args()
world_path = root/'game/assets/world.json'
data = json.loads(world_path.read_text('utf-8'))
blob = zlib.decompress((root/'game/assets/geometry.bin.z').read_bytes())
checks = []


def check(name, passed, detail=None):
    checks.append(dict(name=name, passed=bool(passed), detail=detail))
    print(name, bool(passed), detail)


def geometry(node):
    g = data['geometries'][node['geo']]
    v = np.frombuffer(blob, dtype='<f4', count=g['count']*12, offset=g['offset']).reshape(-1, 12)
    t = np.frombuffer(blob, dtype='<u4', count=g['indexCount'], offset=g['offset']+g['count']*48).reshape(-1, 3)
    return v, t


terrain, _ = geometry(next(n for n in data['staticNodes'] if n.get('terrain')))
xs, zs = np.unique(terrain[:, 0]), np.unique(terrain[:, 2])
ground = terrain[:, 1].reshape(len(zs), len(xs))
step = float(xs[1]-xs[0])


def height(points):
    fx = np.clip((points[:, 0]-xs[0])/step, 0, len(xs)-1.0001)
    fz = np.clip((points[:, 2]-zs[0])/step, 0, len(zs)-1.0001)
    ix, iz = fx.astype(int), fz.astype(int)
    u, v = fx-ix, fz-iz
    a, b, c, d = ground[iz, ix], ground[iz, ix+1], ground[iz+1, ix], ground[iz+1, ix+1]
    return np.where(u >= v, a*(1-u)+b*(u-v)+d*v, a*(1-v)+d*u+c*(v-u))


def footprint_base(points):
    columns = {}
    for x, y, z in points:
        columns[(x, z)] = min(y, columns.get((x, z), float('inf')))
    # Outermost angular sample per sector, independent of mesh ring ordering.
    center = np.array([points[:, 0].mean(), points[:, 2].mean()])
    buckets = {}
    for (x, z), y in columns.items():
        delta = np.array([x, z])-center
        angle = int(np.floor((np.arctan2(delta[1], delta[0])+np.pi)*32/(2*np.pi)))
        distance = float(delta@delta)
        if angle not in buckets or distance > buckets[angle][0]:
            buckets[angle] = (distance, [x, y, z])
    boundary = np.array([p for _, p in buckets.values()])
    # Inner ring columns can occupy an empty sector; the lower, buried perimeter
    # is distinguishable by terrain intersection, while a lifted whole mesh fails.
    return boundary


def winding_ok(vertices, triangles):
    edges = np.cross(vertices[triangles[:, 1], :3]-vertices[triangles[:, 0], :3],
                     vertices[triangles[:, 2], :3]-vertices[triangles[:, 0], :3])
    return bool(np.all(np.einsum('ij,ij->i', edges, vertices[triangles[:, 0], 3:6]) < -1e-7))


def closed_surface(vertices, triangles):
    _, ids = np.unique(np.round(vertices[:, :3], 5), axis=0, return_inverse=True)
    edges = Counter()
    for face in ids[triangles]:
        for a, b in zip(face, np.roll(face, -1)):
            edges[tuple(sorted((int(a), int(b))))] += 1
    return bool(edges) and all(n == 2 for n in edges.values())


def material_ok(vertices):
    color = vertices[:, 6:9]
    return bool(np.isfinite(color).all() and color.max() < .28 and
                np.max(color[:, 0]/np.maximum(color[:, 1], 1e-6)) < 1.8 and
                np.all(vertices[:, 10] == 2))


rows = []
fingerprints = set()
for deposit in data['deposits']:
    if deposit['kind'] not in ('stone', 'iron'):
        continue
    node = deposit['model']
    v, triangles = geometry(node)
    points = v[:, :3]*np.array(node['scale'])+node['position']
    offsets = points[:, 1]-height(points)
    cell_center = np.array([deposit['x'], deposit['z']])
    footprint = np.max(np.abs(points[:, [0, 2]]-cell_center))
    skirt = footprint_base(points)
    skirt_gaps = skirt[:, 1]-height(skirt)
    buried = int(np.count_nonzero(skirt_gaps < -.02))
    # An embedded exposure must intersect soil along the perimeter, and still
    # stand high enough above it to explain the occupied mining cell.
    grounded = buried >= 7 and offsets.max() > .25 and offsets.max() < .6
    label = f"{deposit['kind']} {deposit['gx']},{deposit['gz']}"
    check(label+' closed outward-wound solid', closed_surface(v, triangles) and winding_ok(v, triangles))
    check(label+' fits its resource collision cell', footprint < .49, round(float(footprint), 4))
    check(label+' embedded low bedrock', grounded,
          {'perimeterContacts': buried, 'exposedHeight': round(float(offsets.max()), 4)})
    check(label+' subdued mineral material', material_ok(v))
    raised = offsets+.6
    check(label+' detects raised geometry', not (np.count_nonzero(skirt_gaps+.6 < -.02) >= 7 and raised.max() < .6))
    fingerprints.add(hashlib.sha256(v.tobytes()).hexdigest())
    rows.append({'kind': deposit['kind'], 'cell': [deposit['gx'], deposit['gz']],
                 'triangles': len(triangles), 'exposedHeight': float(offsets.max()),
                 'maxFootprintOffset': float(footprint)})

check('seven distinct resource exposures', len(rows) == len(fingerprints) == 7)
if rows:
    probe = next(d['model'] for d in data['deposits'] if d['kind'] == 'stone')
    vertices, triangles = geometry(probe)
    flipped = triangles.copy();flipped[0] = flipped[0, ::-1]
    vivid = vertices.copy();vivid[:, 6:9] = [.7, .08, .02]
    check('audit rejects an inverted face', not winding_ok(vertices, flipped))
    check('audit rejects a missing face', not closed_surface(vertices, triangles[1:]))
    check('audit rejects vivid orange ore', not material_ok(vivid))

if args.baseline:
    before = json.loads(args.baseline.read_text('utf-8'))
    keys = ['h','ground','biome','bridge','walkable','buildable','obstacle','minHeight','maxHeight','slope','relief']
    check('all navigation and construction cells preserved',
          len(before['cells']) == len(data['cells']) and
          all(all(a[k] == b[k] for k in keys) for a, b in zip(before['cells'], data['cells'])))
    check('all terrain support heights preserved', before['terrain']['heights'] == data['terrain']['heights'])
    check('tree locations and stock preserved',
          [(t['gx'],t['gz'],t['x'],t['z'],t['wood'],t['model']['position']) for t in before['trees']] ==
          [(t['gx'],t['gz'],t['x'],t['z'],t['wood'],t['model']['position']) for t in data['trees']])
    check('resource coordinates and initial structures preserved',
          before['map']['deposits'] == data['map']['deposits'] and
          [(d['kind'],d['gx'],d['gz']) for d in before['deposits']] == [(d['kind'],d['gx'],d['gz']) for d in data['deposits']] and
          [s['cells'] for s in before['structures']] == [s['cells'] for s in data['structures']])

report = dict(passed=all(c['passed'] for c in checks), checks=checks, outcrops=rows,
              worldSha256=hashlib.sha256(world_path.read_bytes()).hexdigest(),
              geometrySha256=hashlib.sha256((root/'game/assets/geometry.bin.z').read_bytes()).hexdigest())
out = root/args.output;out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
sys.exit(0 if report['passed'] else 1)
