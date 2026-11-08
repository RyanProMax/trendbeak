"""Read only the original NPORT identity, never infer series from accession order."""
import json, sys, xml.etree.ElementTree as ET
raw = sys.stdin.buffer.read(2_000_001)
if len(raw) > 2_000_000 or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
    raise ValueError('NPORT XML byte/entity limit')
root = ET.fromstring(raw)
local = lambda element: element.tag.rsplit('}', 1)[-1]
groups = [e for e in root.iter() if local(e) == 'genInfo']
if len(groups) != 1:
    raise ValueError('Exactly one NPORT genInfo required')
def one(name):
    found = [e.text for e in groups[0] if local(e) == name]
    if len(found) != 1 or not found[0]:
        raise ValueError('NPORT identity field missing or duplicated: ' + name)
    return found[0].strip()
print(json.dumps({'seriesId': one('seriesId'), 'reportDate': one('repPdDate')}))
