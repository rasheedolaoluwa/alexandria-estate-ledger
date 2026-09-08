import sys, json, zipfile, hashlib, shutil, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from xml.etree import ElementTree as ET

path = Path(sys.argv[1])
out = Path('data'); out.mkdir(exist_ok=True)
ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def tag(name): return '{'+ns['s']+'}'+name
with zipfile.ZipFile(path) as z:
    strings = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {e.attrib['Id']:e.attrib['Target'] for e in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = []
    for sheet in wb.findall('s:sheets/s:sheet',ns):
        target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        root=ET.fromstring(z.read(target)); cells={}
        for c in root.findall('.//s:sheetData/s:row/s:c', ns):
            v=c.find('s:v',ns); f=c.find('s:f',ns); inline=c.find('s:is',ns)
            if v is None and f is None and inline is None: continue
            raw=v.text if v is not None else None
            typ=c.get('t','n')
            value=strings[int(raw)] if typ=='s' and raw is not None else ''.join(inline.itertext()) if inline is not None else raw
            cells[c.attrib['r']]={'value':value,'type':typ,'raw':raw,'formula':('='+f.text) if f is not None and f.text else None,'formatId':c.get('s')}
        sheets.append({'name':sheet.attrib['name'],'visibility':sheet.get('state','visible'),'cells':cells})

maps={s['name']:s['cells'] for s in sheets}
def cell(sheet,coord):return maps[sheet].get(coord,{'value':None,'type':'n','raw':None,'formula':None})
def value(sheet,coord):return cell(sheet,coord)['value']
def col(n):
    s=''
    while n:n,r=divmod(n-1,26);s=chr(65+r)+s
    return s
def colnum(s):
    n=0
    for c in s:n=n*26+ord(c)-64
    return n
def dec(c):
    if c['type'] not in ('n',):return Decimal(0)
    return Decimal(c['value'] or '0')
def dateval(c):
    if c['value'] is None:return None
    if c['type']=='n':return (datetime(1899,12,30)+timedelta(days=float(c['value']))).isoformat(timespec='milliseconds')
    return c['value']

periods=[];statements=[];issues=[]
for idx,(label,start,end,billTotal) in enumerate([
('December 2025','I','P',15),('January 2026','S','Z',33),('February 2026','AC','AJ',51),
('March 2026','AL','AS',68),('April 2026','AU','BB',86),('May 2026','BD','BL',103),
('June 2026','BN','BV',121),('July 2026','BX','CF',140),('August 2026','CH','CP',158)]):
    pid='2025-12' if idx==0 else f'2026-{idx:02}'
    fields={col(c):value('Financials',col(c)+'2') for c in range(colnum(start)+1,colnum(end)+1)}
    rows=[]
    for r in range(3,12):
        house=int(Decimal(value('Financials',start+str(r))))
        fields_row={label:dict(cell('Financials',c+str(r)),source='Financials!'+c+str(r)) for c,label in fields.items()}
        closing=dec(fields_row['Outstanding']); total=sum((dec(fields_row.get(k,{'type':'n','value':None})) for k in ['Service Charge','Diesel','Power','Generator']),Decimal(0))
        expected=dec(fields_row['Credit'])+dec(fields_row['Paid'])-total
        prev=next((s for s in reversed(statements) if s['house']==house),None)
        delta=dec(fields_row['Credit'])-(Decimal(prev['closing']) if prev else Decimal(0))
        rec={'id':f'{pid}:{house}','period':pid,'house':house,'fields':fields_row,'closing':str(closing),'charges':str(total),'occupancy':'unoccupied' if (fields_row['Status']['value'] or '').lower()=='unoccupied' else 'occupied','carryAdjustment':str(delta),'calculationDifference':str(closing-expected)}
        if abs(closing-expected)>Decimal('0.01'):issues.append({'kind':'Statement calculation','source':fields_row['Outstanding']['source'],'difference':str(closing-expected)})
        statements.append(rec);rows.append(rec)
    periods.append({'id':pid,'label':label,'billTotal':cell('Bill Tracker','F'+str(billTotal)),'billTotalSource':'Bill Tracker!F'+str(billTotal),'occupied':[s['house'] for s in rows if s['occupancy']=='occupied']})

bills=[]
starts=[3,21,39,56,74,91,109,128,146];ends=[14,32,50,67,85,102,120,139,157]
for p,a,b in zip(periods,starts,ends):
    for r in range(a,b+1):
        fields={k:dict(cell('Bill Tracker',c+str(r)),source=f'Bill Tracker!{c}{r}') for c,k in [('A','id'),('B','item'),('C','category'),('D','vendor'),('E','billingPeriod'),('F','billed'),('G','paid'),('H','paymentDate'),('I','outstanding'),('J','status')]}
        if fields['item']['value'] is not None:bills.append({'id':f'Bill Tracker:{r}','period':p['id'],'fields':fields})
    total=sum((dec(b['fields']['billed']) for b in bills if b['period']==p['id']),Decimal(0))
    if abs(total-dec(p['billTotal']))>Decimal('0.01'):issues.append({'kind':'Bill total','source':p['billTotalSource'],'difference':str(total-dec(p['billTotal']))})

bank=[]
for r in sorted({int(re.search(r'\d+',k).group()) for k in maps['Account Statement movement']}):
    if r<2:continue
    cells={k:dict(cell('Account Statement movement',c+str(r)),source=f'Account Statement movement!{c}{r}') for c,k in [('A','date'),('B','description'),('C','amount')]}
    if cells['amount']['value'] is not None:bank.append({'id':f'bank:{r}','date':dateval(cells['date']),'fields':cells})

venco=[]
for r in sorted({int(re.search(r'\d+',k).group()) for k in maps['Venco']}):
    if r < 2: continue
    a=cell('Venco','A'+str(r));b=cell('Venco','B'+str(r));c=cell('Venco','C'+str(r));d=cell('Venco','D'+str(r))
    if a['type']=='n' and b['type']=='s' and d['value'] is not None:
        venco.append({'id':f'venco:{r}','source':f'Venco!A{r}:D{r}','date':dateval(a),'unit':b['value'],'units':c,'amount':d,'layout':'transaction'})
    elif a['type']=='s' and str(a['value']).startswith('Unit ') and b['value'] is not None:
        venco.append({'id':f'venco:{r}','source':f'Venco!A{r}:C{r}','date':dateval(c),'unit':a['value'],'units':None,'amount':b,'layout':'credit'})

digest=hashlib.sha256(path.read_bytes()).hexdigest()
data={'importedAt':datetime.now(timezone.utc).isoformat(),'sourceUrl':sys.argv[2] if len(sys.argv)>2 else '','sha256':digest,'sheets':sheets,'periods':periods,'statements':statements,'bills':bills,'bank':bank,'venco':venco,'issues':issues}
(out/'history.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
shutil.copyfile(path,out/'original-workbook.xlsx')
print(json.dumps({'sheets':len(sheets),'cells':sum(len(s['cells']) for s in sheets),'statements':len(statements),'bills':len(bills),'bank':len(bank),'venco':len(venco),'reconciliationIssues':issues,'sha256':digest},indent=2))
