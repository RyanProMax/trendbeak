"""Bounded public projection of the independently reviewed private N-CSRS package."""
import hashlib,json,sys
from pathlib import Path
from decimal import Decimal

def digest(raw): return hashlib.sha256(raw).hexdigest()
def bounded(path,limit):
    if not path.is_file() or path.stat().st_size>limit: raise ValueError('Private input byte bound')
    return path.read_bytes()

def main():
    input_path,metadata_path,root=map(lambda s:Path(s).resolve(),sys.argv[1:4])
    folder=root/'ai-theme-backfill-20261110/phase25-dram-ncsrs-fed-complete'
    # Authenticate all package bytes before importing any executable source.
    manifest=bounded(root/'PAYLOAD-MANIFEST.json',1024*1024)
    if digest(manifest)!='2616fc154f4a5450bc6366568d78b44930f786aa6994e5ff07a96fac2ee2ec10': raise ValueError('Unreviewed package manifest')
    payload=json.loads(manifest)
    rows=payload['files'] if isinstance(payload,dict) else payload
    for entry in rows:
        target=(root/entry['path']).resolve()
        if not target.is_relative_to(root): raise ValueError('Package path escape')
        raw=bounded(target,16*1024*1024)
        if digest(raw)!=entry['sha256']: raise ValueError('Package bytes changed')
    allowed={root/entry['path'] for entry in rows if (root/entry['path']).parent==folder}
    actual=set(folder.iterdir())
    if actual!=allowed or any(not path.is_file() or path.is_symlink() for path in actual):
        raise ValueError('Unmanifested import directory entry')
    raw=bounded(input_path,2*1024*1024); meta_raw=bounded(metadata_path,1024*1024)
    data=json.loads(raw); metadata=json.loads(meta_raw)
    if metadata.get('inputSha256')!=digest(raw): raise ValueError('Metadata input mismatch')
    sys.path.insert(0,str(folder))
    import complete_method as M
    import build_metadata as B
    catalog=json.loads((folder/'assumption-catalog-v3.json').read_text())
    B.validate(data,catalog,metadata)
    if any(Decimal(c['k'])!=1 for c in data['conditionalCoefficients'].values()): raise ValueError('Only conditional k=1 supported')
    result=M.calculate(data)
    names={c['isin']:c['name'] for c in data['companies']}
    items=[{**a,**({'issuerName':names[a['issuerIsin']]} if a['scope']=='issuer' else {})} for a in metadata['items']]
    metrics={k:{'value':float(result['metrics'][v]['riskSleeveMultiple']) if result['metrics'][v]['riskSleeveMultiple'] is not None else None,'complete':result['metrics'][v]['complete'],'knownAt':result['metrics'][v]['knownAt']['date'] if result['metrics'][v]['knownAt'] else None} for k,v in [('pb','book'),('ps','sales')]}
    reading={'code':'DRAM','seriesId':result['seriesId'],'methodVersion':result['methodVersion'],'sourceVersion':data['sourceVersion'],'economicDate':result['economicAsOf'],'priceDate':result['economicAsOf'],'holdingsKnownAt':result['holdingsPublication']['date'],'metrics':metrics,'assumptions':{'swapCoefficient':1,'items':items}}
    print(json.dumps({'source':'sec_ncsrs_fed_conditional_holdings','datasetKind':data['datasetKind'],'inputSha256':digest(raw),'assumptionsSha256':digest(meta_raw),'reading':reading},ensure_ascii=False,allow_nan=False))
if __name__=='__main__':main()
