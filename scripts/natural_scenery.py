"""Only wooden crossings and natural deposits may dress the starting terrain."""
import math
import numpy as np


class MeshParts:
    def __init__(self):
        self.vertices = []
        self.indices = []

    def face(self, points, color, material):
        points = np.asarray(points, dtype=float)
        normal = np.cross(points[1] - points[0], points[2] - points[0])
        normal /= np.linalg.norm(normal)
        start = len(self.vertices)
        for point in points:
            self.vertices.append([*point, *normal, *color, 1, material, 0])
        for i in range(1, len(points)-1):
            self.indices.extend([start, start+i+1, start+i])

    def box(self, center, size, color, basis=None, material=4):
        corners = np.array([[-1,-1,-1], [1,-1,-1], [1,-1,1], [-1,-1,1],
                            [-1,1,-1], [1,1,-1], [1,1,1], [-1,1,1]], dtype=float)
        corners *= np.asarray(size)/2
        if basis is not None:
            corners = corners @ basis.T
        corners += center
        for face in [[0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0]]:
            points = corners[face]
            if np.dot(np.cross(points[1]-points[0], points[2]-points[0]), points.mean(axis=0)-center) < 0:
                points = points[::-1]
            self.face(points, color, material)

    def beam(self, start, end, thickness, color):
        start, end = np.asarray(start), np.asarray(end)
        direction = end-start
        length = np.linalg.norm(direction)
        direction /= length
        side = np.cross(direction, [0,0,1])
        side /= np.linalg.norm(side)
        basis = np.column_stack([direction, side, np.cross(direction, side)])
        self.box((start+end)/2, [length,thickness,thickness], color, basis)

    def export(self, geometry):
        return geometry.add(self.vertices, self.indices)


def wooden_bridge(geometry, length, width):
    """Deck top is exactly Y=.4; timber rails preserve 1.76m clear passage."""
    mesh = MeshParts()
    boards = round(length/.2)
    for i in range(boards):
        x = -length/2 + (i+.5)*length/boards
        color = np.array([.29,.16,.067]) * (.91+(i*7 % 11)*.018)
        mesh.box([x,.32,0], [length/boards-.012,.16,width], color)
    for z in [-width*.30,width*.30]:
        mesh.box([0,.17,z], [length,.18,.18], [.14,.069,.026])
    for z in [-width/2+.06,width/2-.06]:
        for x in np.linspace(-length/2+.14,length/2-.14,4):
            mesh.box([x,-.10,z], [.13,1.92,.12], [.19,.09,.032])
        for y in [.62,.92]:
            mesh.box([0,y,z], [length,.085,.085], [.24,.115,.041])
        # Visible timber bracing underneath the span, with no masonry abutments.
        for sign in [-1,1]:
            mesh.beam([sign*(length/2-.14),-.72,z], [sign*.38,.16,z], .11, [.16,.075,.026])
    return mesh.export(geometry)


def pitch_seep(geometry, seed):
    """Irregular exposed peat/resin seep, without a bowl, barrel or worked rim."""
    rng = np.random.default_rng(seed)
    mesh = MeshParts()
    angles = np.arange(11)*math.tau/11
    radius = rng.uniform(.34,.48,len(angles))
    outer = np.column_stack([np.cos(angles)*radius, rng.uniform(.018,.027,len(angles)), np.sin(angles)*radius*.85])
    center = [0,.035,0]
    for i in range(len(angles)):
        j = (i+1)%len(angles)
        # Upward facing triangles, clockwise winding at export.
        mesh.face([center,outer[j],outer[i]], np.array([.045,.036,.018])*rng.uniform(.8,1.2), 0)
        edge0=outer[i].copy();edge1=outer[j].copy();edge0[1]=0;edge1[1]=0
        mesh.face([outer[i],outer[j],edge1,edge0], [.062,.049,.027], 2)
    return mesh.export(geometry)


def bedrock_outcrop(geometry, kind, seed, center, support, palette):
    """A low, weathered exposure of the slope, entirely inside its resource cell."""
    rng = np.random.default_rng(seed)
    mesh = MeshParts()
    cx, cz = center
    base_y = support(cx, cz)
    count = 9
    angles = np.arange(count)*math.tau/count + rng.uniform(-.045, .045, count)
    phase = rng.uniform(-.35, .35)
    radius = rng.uniform(.82, 1.0, count)
    radius[int(rng.integers(count))] *= .73
    outline = np.column_stack([np.cos(angles+phase)*radius*.46,
                               np.sin(angles+phase)*radius*.43])
    shift = rng.uniform(-.045, .045, 2)
    rings = []
    # Each perimeter point seats into the actual rendered triangles. The broad
    # upper faces are exposed bedrock, not stacked ellipsoids or ore crystals.
    relief = rng.uniform(.34, .47)
    for fraction, lift in [(1.0, -.055), (.92, .04), (.77, relief*.78), (.34, relief)]:
        points = []
        for i, xy in enumerate(outline*fraction + shift*(1-fraction)):
            y = support(cx+xy[0], cz+xy[1])-base_y+lift
            if lift > .05:
                y += math.sin(angles[i]*2+phase)*.04
            points.append([xy[0], y, xy[1]])
        rings.append(np.asarray(points))
    stone = np.array(palette['bedrockColor'])
    weather = np.array(palette['weatheredColor'])
    moss = np.array(palette['mossColor'])
    stain = np.array(palette['ironStainColor'])

    def face_color(points, band):
        at = np.asarray(points).mean(axis=0)
        tone = stone*(1.02+rng.random()*.08)
        tone = tone*.80 + weather*.20
        if kind == 'iron':
            # Oxidation follows one narrow fracture through the host rock.
            vein = max(0.0, 1-abs(at[0]+at[2]*.65-.055)/.15)
            tone = tone*(1-vein*.42)+stain*vein*.42
        # Weathering/lichen follows a sheltered edge, never an identical ring.
        damp = np.clip((at[2]-.02)*1.4, 0, .38)
        if band == 0:
            damp = max(damp, .22)
        return tone*(1-damp)+moss*damp

    for band in range(len(rings)-1):
        lower, upper = rings[band], rings[band+1]
        for i in range(count):
            j = (i+1)%count
            # Two triangles retain broad fracture planes without nonplanar quads.
            for points in [[lower[i], upper[i], upper[j]], [lower[i], upper[j], lower[j]]]:
                mesh.face(points, face_color(points, band), 2)
    crest = np.array([shift[0], 0, shift[1]], dtype=float)
    crest[1] = support(cx+crest[0], cz+crest[2])-base_y+relief*.98
    for i in range(count):
        j = (i+1)%count
        points = [crest, rings[-1][j], rings[-1][i]]
        mesh.face(points, face_color(points, 3), 2)
    # A buried underside closes the solid; nothing is a floating surface decal.
    bottom = np.array([0, min(p[1] for p in rings[0])-.04, 0])
    for i in range(count):
        j = (i+1)%count
        mesh.face([bottom, rings[0][i], rings[0][j]], stone*.75, 2)
    return mesh.export(geometry)
