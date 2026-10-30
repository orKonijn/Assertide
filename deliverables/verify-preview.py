from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
assets = root.parent / 'docs' / 'changelog' / 'assets' / 'unreleased'
assets.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto((root / 'preview.html').as_uri(), wait_until='networkidle')
    for theme in ['Light', 'Dark']:
        if theme == 'Dark': page.locator('#theme').click()
        for mobile in [False, True]:
            if mobile: page.locator('#mobile').click()
            for screen in page.evaluate('[...DESIGN.screens,...DESIGN.states].map(s=>s.id)'):
                page.select_option('#screen', screen)
                page.wait_for_timeout(220)
                overflow = page.locator('#app').evaluate('(e)=>e.scrollWidth>e.clientWidth+1')
                results.append({'screen': screen, 'theme': theme, 'mobile': mobile, 'overflow': overflow})
                if screen == 'dashboard' and ((theme == 'Light') or (theme == 'Dark' and not mobile)):
                    page.locator('#app').screenshot(path=str(assets / f'design-preview-{theme.lower()}-{"mobile" if mobile else "desktop"}.png'))
            if mobile: page.locator('#mobile').click()
    # Confirm the primary flow routes from shared content, not a hand-maintained duplicate.
    for flow in [['login','projects','suites','explorer','configure','live-new','result-new','allure-new'], ['api','api-live','api-result','api'], ['history','result','configure-rerun','live','result']]:
        page.select_option('#screen', flow[0])
        for target in flow[1:]:
            page.locator('.heading .primary').click()
            page.wait_for_function('(id)=>location.hash==="#"+id', arg=target)
    browser.close()
report={'viewsChecked':len(results),'overflowFailures':[r for r in results if r['overflow']],'pageErrors':errors,'primaryFlows':'passed','scope':'Local HTML design review only; not Figma rendering or application execution'}
(root/'preview-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
if report['overflowFailures'] or errors: raise SystemExit(1)
