import json,sys
d=json.load(open(sys.argv[1])); pat = sys.argv[2].lower() if len(sys.argv)>2 else None
for w,nodes in d.items():
    print('==',w,len(nodes))
    for n in nodes:
        t=' | '.join(x for x in [n.get('title'),n.get('desc'),n.get('value'),n.get('help'),n.get('ident')] if x)
        if t and (pat is None or pat in t.lower()): print('  '*min(n['d'],14), n.get('role'), '|', t[:180])
