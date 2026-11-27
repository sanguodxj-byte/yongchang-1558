"""Place the offshore fortress using the preserved shipyard model library."""
import copy


def structures(base, spec):
    layout = spec['map']
    fort = layout['fortress']
    island_shift = layout['island']['x'] - base['map']['island']['x']
    origin_shift = (layout['width'] - base['map']['width']) / 2
    result = copy.deepcopy(base['structures'])
    for item in result:
        shift = island_shift if item['team'] == 'enemy' else 0
        item['gx'] += shift
        item['x'] += shift - origin_shift
        for cell in item['cells']:
            cell[0] += shift
        if 'model' in item:
            item['model']['position'][0] += shift - origin_shift
        if item['team'] == 'enemy':
            hp_key = {'wall': 'outerWallHp', 'gate': 'outerGateHp',
                      'tower': 'outerTowerHp', 'keep': 'keepHp'}.get(item['type'])
            if hp_key:
                item['hp'] = fort[hp_key]
                item['defenseLayer'] = 'outer' if item['type'] != 'keep' else 'keep'

    # The legacy starter depot was only a decorative scene root. Give it the
    # same occupied footprint and delivery identity as player-built depots.
    sx, sz = layout['stockpile']
    depot = {'type': 'stockpile', 'label': '营造物资堆放场', 'team': 'player',
             'gx': sx, 'gz': sz, 'x': sx + 1 - layout['width']/2,
             'y': .4, 'z': sz + 1 - layout['height']/2, 'hp': 280,
             'height': .45, 'half': {'hx': .97, 'hz': .97}, 'custom': False,
             'cells': [[sx+x, sz+z] for x in range(2) for z in range(2)],
             'model': copy.deepcopy(base['models']['player_stockpile'])}
    depot['model']['position'] = [depot['x'], depot['y'], depot['z']]
    result.append(depot)

    def template(kind, gx=None, gz=None):
        return next(s for s in base['structures'] if s['team'] == 'enemy' and
                    s['type'] == kind and (gx is None or s['gx'] == gx) and
                    (gz is None or s['gz'] == gz))

    def place(source, cells, hp, label):
        item = copy.deepcopy(source)
        item['cells'] = [list(c) for c in cells]
        item['gx'], item['gz'] = cells[0]
        item['x'] = sum(c[0] + .5 for c in cells) / len(cells) - layout['width'] / 2
        item['z'] = sum(c[1] + .5 for c in cells) / len(cells) - layout['height'] / 2
        item['hp'], item['label'], item['defenseLayer'] = hp, label, 'inner'
        item['model']['position'] = [item['x'], .4, item['z']]
        result.append(item)
        return item

    x0, z0, x1, z1 = fort['innerRect']
    gx, gz = fort['innerGate']
    towers = {tuple(p) for p in layout['enemyTowers'][2:]}
    for z in range(z0, z1 + 1):
        for x in range(x0, x1 + 1):
            if x not in (x0, x1) and z not in (z0, z1):
                continue
            if (x, z) in towers or (x == gx and z in (gz, gz + 1)):
                continue
            source = template('wall', gx=123) if x in (x0, x1) else template('wall', gx=124, gz=43)
            place(source, [(x, z)], fort['innerWallHp'], '内寨重木栅')
    place(template('gate'), [(gx, gz), (gx, gz + 1)], fort['innerGateHp'], '内寨包铁栅门')
    for x, z in sorted(towers):
        place(template('tower'), [(x, z)], fort['innerTowerHp'], '内寨铳楼')
    for x, z in fort['cannons']:
        gun = {'type': 'ballista', 'team': 'enemy', 'height': 2.15, 'custom': False,
               'half': {'hx': .48, 'hz': .48}, 'model': base['models']['enemy_ballista']}
        gun = place(gun, [(x, z)], fort['cannonHp'], '岛寨岸防炮台')
        gun.update(attackDamage=fort['cannonDamage'], attackRange=fort['cannonRange'],
                   attackCooldown=fort['cannonCooldown'], defenseLayer='outer')
    # Leave a full cell between the south cannon and the rigging shed's eaves.
    for item in result:
        if item['team'] == 'enemy' and item['type'] == 'supply' and item['label'] == '索具仓棚':
            item['gx'] += 2; item['x'] += 2
            item['model']['position'][0] += 2
            for cell in item['cells']: cell[0] += 2
    occupied = set()
    for item in result:
        for cell in item['cells']:
            key = tuple(cell)
            if key in occupied:
                raise ValueError(f'Overlapping fortress footprint: {key}, {item["label"]}')
            occupied.add(key)
    return result
