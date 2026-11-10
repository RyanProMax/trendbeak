"""Offline projection of the frozen conditional kernel; no separate valuation formula."""
import hashlib
import json
import sys
from decimal import Decimal
from pathlib import Path
from dram_model import calculate


def prepare(data, metadata):
    if data.get('datasetKind') not in ('real_source_bound', 'synthetic_algebra_only'):
        raise ValueError('Unknown input kind')
    if any(Decimal(c['k']) != 1 for c in data['conditionalCoefficients'].values()):
        raise ValueError('Only explicitly conditional k=1 is supported')
    codes = json.loads((Path(__file__).parent.parent / 'data/us-dram-assumptions.json').read_text())
    items = metadata.get('items')
    if not isinstance(items, list) or not 0 < len(items) <= 100:
        raise ValueError('Reviewed material assumptions required')
    raw_fund = data.get('assumptions', [])
    raw_companies = [{'companyIndex': i, 'issuerIsin': c['isin'], 'estimatedFlags': c.get('estimatedFlags', [])}
                     for i, c in enumerate(data['companies'])]
    if metadata.get('rawFundAssumptions') != raw_fund or metadata.get('rawCompanyFlags') != raw_companies:
        raise ValueError('Original assumption context missing or changed')
    expected = {('fund_assumptions', i, None): text for i, text in enumerate(raw_fund)}
    expected.update({('issuer_estimatedFlags', i, c['issuerIsin']): text
                     for c in raw_companies for i, text in enumerate(c['estimatedFlags'])})
    audit = metadata.get('coverageAudit')
    if not isinstance(audit, list) or len(audit) != len(expected):
        raise ValueError('Assumption coverage incomplete')
    seen = set()
    for entry in audit:
        key = (entry.get('sourceKind'), entry.get('index'),
               entry.get('issuerIsin') if entry.get('sourceKind') == 'issuer_estimatedFlags' else None)
        refs = entry.get('references')
        if key in seen or key not in expected or entry.get('originalText') != expected[key] or not isinstance(refs, list):
            raise ValueError('Assumption coverage mismatch')
        if any(ref not in items for ref in refs) or not refs and not entry.get('contextualReason'):
            raise ValueError('Unmapped material assumption')
        issuer = entry.get('issuerIsin')
        if issuer is not None and (issuer not in {c['isin'] for c in data['companies']}
                                   or any(ref.get('scope') == 'issuer' and ref.get('issuerIsin') != issuer for ref in refs)):
            raise ValueError('Assumption coverage issuer mismatch')
        seen.add(key)
    companies = {c['isin']: c['name'] for c in data['companies']}
    reviewed = []
    for item in items:
        if item.get('code') not in codes or item.get('scope') not in ('fund', 'issuer') or item.get('scope') != codes[item['code']]['scope'] or set(item) - {'code', 'scope', 'issuerIsin'}:
            raise ValueError('Unknown assumption code or scope')
        entry = dict(item)
        if item['scope'] == 'issuer':
            if item.get('issuerIsin') not in companies:
                raise ValueError('Assumption issuer not in input')
            entry['issuerName'] = companies[item['issuerIsin']]
        elif 'issuerIsin' in item:
            raise ValueError('Fund assumption cannot name issuer')
        if entry in reviewed:
            raise ValueError('Duplicate assumption')
        reviewed.append(entry)
    required = {'conditional_trs_notional', 'fund_reported_marks', 'retrospective_date_only'}
    if not required.issubset({i['code'] for i in reviewed if i['scope'] == 'fund'}):
        raise ValueError('Fund assumptions incomplete')
    result = calculate(data)
    metrics = {}
    for key, source in [('pb', 'book'), ('ps', 'sales')]:
        m = result['metrics'][source]
        metrics[key] = {'value': float(m['riskSleeveMultiple']) if m['riskSleeveMultiple'] is not None else None,
                        'complete': m['complete'], 'knownAt': m['knownAt']['date'] if m['knownAt'] else None}
    return {'code': 'DRAM', 'seriesId': result['seriesId'], 'methodVersion': result['methodVersion'],
            'economicDate': result['economicAsOf'], 'priceDate': result['economicAsOf'],
            'holdingsKnownAt': result['holdingsPublication']['date'],
            'metrics': metrics, 'assumptions': {'swapCoefficient': 1, 'items': reviewed}}


if __name__ == '__main__':
    path = Path(sys.argv[1])
    if not path.is_file() or path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Input exceeds bound')
    raw = path.read_bytes()
    data = json.loads(raw)
    metadata_path = Path(sys.argv[2])
    if not metadata_path.is_file() or metadata_path.stat().st_size > 65536:
        raise ValueError('Assumptions exceed bound')
    metadata_raw = metadata_path.read_bytes()
    metadata = json.loads(metadata_raw)
    if metadata.get('inputSha256') != hashlib.sha256(raw).hexdigest():
        raise ValueError('Assumptions input hash mismatch')
    print(json.dumps({'source': 'sec_nport_conditional_holdings', 'datasetKind': data['datasetKind'], 'inputSha256': hashlib.sha256(raw).hexdigest(),
                      'assumptionsSha256': hashlib.sha256(metadata_raw).hexdigest(), 'reading': prepare(data, metadata)}, allow_nan=False))
