from pathlib import Path
import re, json, html, zipfile
import markdown

root=Path(__file__).resolve().parent
for relative in ['06-brand-and-design-system.md','figma-plugin/README.md']:
    p=root/relative
    s=p.read_text(encoding='utf8').replace('11 supporting states','13 supporting states').replace('92 screen/state','100 screen/state').replace('verify 92 frames','verify 100 frames').replace('= 92','= 100')
    s=s.replace('The result frame uses a historical failed-run example even when entered from the new-live view; it illustrates the investigation pattern, not a simulated backend completing the live run. Use the labels to distinguish run IDs. Native controls are a design prototype and do not launch tests.','The new-run path uses R-1044 and its own result/report; history and rerun paths retain R-1042/R-1043 lineage. Native controls are a design prototype and do not launch tests.')
    p.write_text(s,encoding='utf8')
docs=sorted(root.glob('0[1-7]-*.md'))
style='''body{margin:0;background:#f5f6fa;color:#182237;font:15px/1.7 Inter,Arial,sans-serif}header{background:#151e30;color:white;padding:48px max(24px,calc((100% - 1180px)/2))}header p{color:#c4cee2}main{max-width:1180px;margin:auto;padding:36px 24px}h1,h2,h3{line-height:1.3}h1{font-size:36px;letter-spacing:-1px}h2{margin-top:36px}a{color:#5145cd}header a{color:#c8c0ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card,article{background:white;border:1px solid #d8dfea;border-radius:12px;padding:24px;margin-bottom:18px}.card h2{margin:0;font-size:19px}.card p{color:#58657b}table{border-collapse:collapse;display:block;overflow:auto;font-size:13px;width:100%}th,td{border:1px solid #d8dfea;padding:12px;text-align:left;vertical-align:top}th{background:#eef0f7}pre{background:#151e30;color:#eef3ff;border-radius:9px;padding:20px;overflow:auto;font-size:12px}code{font-family:Consolas,monospace}img{max-width:100%}.badge{display:inline-block;background:#eeebff;color:#5145cd;padding:6px 12px;border-radius:20px;font-size:12px}.warning{border-left:4px solid #926000;background:#fff9eb;padding:18px 22px}.assets{display:flex;gap:24px;flex-wrap:wrap;align-items:center}.assets img{width:140px}.assets .logo{width:235px}footer{font-size:12px;color:#58657b;margin:36px 0}@media(max-width:700px){header{padding:32px 20px}main{padding:20px}h1{font-size:29px}}'''
cards=[]
for p in docs:
    title=p.read_text(encoding='utf8').splitlines()[0].lstrip('# ')
    body=markdown.markdown(p.read_text(encoding='utf8'),extensions=['tables','fenced_code'])
    name=p.with_suffix('.html').name
    (root/name).write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{style}</style><header><a href="index.html">← Assertide deliverables</a></header><main><article>{body}</article></main></html>',encoding='utf8')
    cards.append(f'<a class="card" href="{name}"><h2>{html.escape(title)}</h2><p>Read the complete document →</p></a>')
index=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assertide product and design handoff</title><style>{style}</style><header><span class="badge">PRODUCT & DESIGN HANDOFF · UNRELEASED</span><h1>Assertide</h1><p>Confidence, one run at a time.</p><p>Product specification, architecture, test strategy, brand system and design review.</p><a href="preview.html">Open the interactive design review →</a></header><main><div class="warning"><strong>Figma delivery remains blocked.</strong> The created file is empty because the connected Figma Starter plan exhausted its tool quota. The supplied native design generator has not been run or visually validated in Figma. <a href="https://www.figma.com/design/Omm8667aVR3UJbtJ5VTYfC">Open the created file</a>.</div><h2>Engineering and product documents</h2><div class="grid">{''.join(cards)}</div><h2>Brand assets</h2><article class="assets"><img class="logo" src="brand/logo-primary.svg" alt="Assertide primary logo">{''.join(f'<img src="brand/mascot-{pose}.svg" alt="Pip mascot {pose} pose">' for pose in ['welcome','success','failure','loading'])}</article><div class="grid"><div class="card"><h2>Review the screens</h2><p>12 main views, light/dark themes, mobile layouts and linked journeys. Synthetic data; this is a design prototype.</p><a href="preview.html">Open preview</a></div><div class="card"><h2>Editable Figma generator</h2><p>Native text, vectors, components, variables and links. 100 intended screen/state frames.</p><a href="figma-plugin/README.md">Import and validation instructions</a></div><div class="card"><h2>Playwright examples</h2><p>TypeScript checked; five discovered test instances. No target tests executed.</p><a href="examples/README.md">Example setup</a></div></div><footer>Research and delivery: 29 October 2026. No product release version assigned. Example package 0.1.0 is not an application release. Naming/domain clearance remains unverified.</footer></main></html>'''
(root/'index.html').write_text(index,encoding='utf8')
with zipfile.ZipFile(root/'assertide-handoff.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if not p.is_file() or 'node_modules' in p.parts or p.suffix=='.zip' or any(x in p.parts for x in ['test-results','allure-results','__pycache__']):continue
        z.write(p,p.relative_to(root))
    for name in ['AGENTS.md','CHANGELOG.md']:
        z.write(root.parent/name,name)
    for p in (root.parent/'docs').rglob('*'):
        if p.is_file():z.write(p,p.relative_to(root.parent))
print(json.dumps({'documents':len(docs),'archiveBytes':(root/'assertide-handoff.zip').stat().st_size}))
