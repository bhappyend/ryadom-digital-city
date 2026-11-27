"""Measure incomplete OSM ways, including whether their known geometry intersects pilot bounds.

Uses pyosmium shipped in the pinned Nominatim image; no network, no source mutation.
"""
import json
import tempfile
import osmium

WEST, SOUTH, EAST, NORTH = 31.7883262, 54.7075603, 32.2095639, 54.8503780

class Check(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes = self.ways = self.relations = self.missing_refs = 0
        self.incomplete = []
        self.pilot_intersections = []
        self.unknown_extent = []

    def node(self, node):
        self.nodes += 1

    def way(self, way):
        self.ways += 1
        invalid = [node.ref for node in way.nodes if not node.location.valid()]
        if not invalid:
            return
        self.missing_refs += len(invalid)
        locations = [node.location for node in way.nodes if node.location.valid()]
        extent = None
        if locations:
            extent = [min(n.lon for n in locations), min(n.lat for n in locations), max(n.lon for n in locations), max(n.lat for n in locations)]
        item = {"way": way.id, "missingCount": len(invalid), "firstMissing": invalid[:5], "knownBounds": extent, "highway": way.tags.get('highway'), "water": way.tags.get('water')}
        self.incomplete.append(item)
        if extent is None:
            self.unknown_extent.append(item)
        elif extent[0] <= EAST and extent[2] >= WEST and extent[1] <= NORTH and extent[3] >= SOUTH:
            self.pilot_intersections.append(item)

    def relation(self, relation):
        self.relations += 1

with tempfile.TemporaryDirectory(prefix='extract-check-', dir='/data/runtime') as temp:
    index = osmium.index.create_map(f'sparse_file_array,{temp}/locations.idx')
    locator = osmium.NodeLocationsForWays(index)
    locator.ignore_errors()
    check = Check()
    reader = osmium.io.Reader('/data/runtime/smolensk.osm.pbf')
    try:
        osmium.apply(reader, locator, check)
    finally:
        reader.close()
    result = {"nodes": check.nodes, "ways": check.ways, "relations": check.relations, "missingWayNodeReferences": check.missing_refs, "incompleteWays": len(check.incomplete), "pilotBounds": [WEST,SOUTH,EAST,NORTH], "pilotIntersectingIncompleteWays": check.pilot_intersections, "unknownExtentIncompleteWays": check.unknown_extent, "samples": check.incomplete[:20], "scope": "Way-node completeness only; not a proof of complete relation membership or full regional data. Center MVT and routes checked independently."}
    with open('/data/evidence/extract-integrity.json','w',encoding='utf8') as output:
        json.dump(result,output,ensure_ascii=False,indent=2)
    print(json.dumps({k:v for k,v in result.items() if k!='samples'},ensure_ascii=False,indent=2))
