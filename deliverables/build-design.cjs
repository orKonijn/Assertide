const fs = require('fs');
const path = require('path');
const root = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(root,'design-content.json'),'utf8'));
const svg = (body,w=24,h=w) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${body}</svg>`;
const paths = {
  overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  folder:'M3 7V5h7l2 3h9v12H3z', layers:'m12 3 10 5-10 5L2 8z M3 12l9 5 9-5 M3 16l9 5 9-5',
  search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  play:'m8 4 12 8-12 8z', chart:'M4 3v17h17 M8 15l4-5 4 2 5-8',
  code:'m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
  settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  passed:'m5 12 4 4L19 6', failed:'m6 6 12 12 M18 6 6 18',
  skipped:'m4 5 10 7-10 7z M18 5v14', canceled:'M5 5h14v14H5z',
  running:'M12 3a9 9 0 1 1-9 9 M12 3v9l5 3', queued:'M12 3a9 9 0 1 0 9 9 M8 3h8 M12 7v6',
  broken:'m13 2-3 8 5 3-4 9 M5 5l3 3 M16 16l3 3', chevron:'m9 5 7 7-7 7', download:'M12 3v12 m-5-5 5 5 5-5 M4 17v4h16v-4', sun:'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'
};
data.icons = Object.fromEntries(Object.entries(paths).map(([k,d])=>[k,svg(`<path d="${d}" stroke="#58657B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`)]));
data.logo = svg('<rect width="48" height="48" rx="14" fill="#5145CD"/><path d="m11 33 13-21 13 21 M17 27h14" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="m22 33 5 4 10-11" stroke="#A7F3D0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',48);
function mascot(pose) {
 const mouth = pose==='failure'?'M77 103q13-12 26 0':pose==='loading'?'M83 100h14':'M76 96q14 16 28 0';
 const arm = pose==='welcome'?'M128 86q26-18 18-44':pose==='success'?'M129 87l23-24':'M129 87l18 17';
 const extras = pose==='success'?'<path d="m138 35 7 7 14-17" stroke="#147455" stroke-width="5" stroke-linecap="round"/>':pose==='failure'?'<path d="M144 28v14m0 8v1" stroke="#B92F49" stroke-width="5" stroke-linecap="round"/>':pose==='loading'?'<path d="M145 31a15 15 0 1 1-15 15" stroke="#5145CD" stroke-width="5" stroke-linecap="round"/>':'';
 return svg(`<ellipse cx="90" cy="160" rx="52" ry="8" fill="#D8DFEA"/><path d="M68 133v19 M111 133v19 M51 84l-21 20 ${arm}" stroke="#5145CD" stroke-width="10" stroke-linecap="round"/><path d="M90 43V27" stroke="#5145CD" stroke-width="6"/><circle cx="90" cy="23" r="7" fill="#70DBB2"/><rect x="45" y="43" width="90" height="94" rx="30" fill="#5145CD"/><rect x="56" y="57" width="68" height="56" rx="20" fill="#EEEBFF"/><circle cx="75" cy="80" r="5" fill="#182237"/><circle cx="105" cy="80" r="5" fill="#182237"/><path d="${mouth}" stroke="#182237" stroke-width="4" stroke-linecap="round"/><path d="m81 123 6 5 12-11" stroke="#A7F3D0" stroke-width="4" stroke-linecap="round"/>${extras}`,180);
}
data.mascots=Object.fromEntries(['welcome','success','failure','loading'].map(x=>[x,mascot(x)]));
const newLive=structuredClone(data.screens.find(s=>s.id==='live'));
newLive.id='live-new';newLive.eyebrow='SWAG STORE / R-1044';newLive.subtitle='New selection · Local sandbox · Chromium · started by Maya Chen';
newLive.sections=JSON.parse(JSON.stringify(newLive.sections).replaceAll('UI-009','UI-001').replaceAll('Logout clears session','Valid login').replaceAll('rerun','new run'));
data.states.push(newLive);
data.screens.find(s=>s.id==='configure').next='live-new';
const rerun=structuredClone(data.screens.find(s=>s.id==='configure'));
rerun.id='configure-rerun';rerun.title='Rerun failed tests';rerun.subtitle='Inherited from R-1042. Review the same source and environment before starting.';rerun.next='live';
rerun.sections[0].body='UI-005 Checkout completes · UI-009 Logout clears session · illustrative revision 8f2c0a1';
data.states.push(rerun);data.screens.find(s=>s.id==='result').next='configure-rerun';
data.states.push({id:'allure-view',title:'Allure report · R-1042',eyebrow:'PRIVATE REPORT VIEWER',subtitle:'Integrated report view · illustrative results · isolated report origin',action:'Back to result',next:'result',sections:[{type:'metrics',items:[['Passed','21','Final test instances'],['Failed','2','Investigate below'],['Skipped','1','Excluded from denominator'],['Pass rate','91.3%','21 / 23 executed']]},{type:'table',title:'Suite results',columns:['Test','Status','Attempts','Evidence'],rows:[['UI-005 · Checkout completes','Failed','1','Screenshot + trace'],['UI-009 · Logout clears session','Failed','1','Trace'],['UI-001 · Valid login','Passed','1','Steps']],target:'result'},{type:'notice',title:'Secure report integration',body:'The production viewer serves authenticated Allure HTML on a separate origin. This frame illustrates the integration; it is not a generated Allure report.'}]});
data.screens.find(s=>s.id==='reports').next='allure-view';
const newResult=structuredClone(data.screens.find(s=>s.id==='result'));newResult.id='result-new';newResult.eyebrow='R-1044 / UI-005 / ATTEMPT 1';newResult.action='Open Allure report';newResult.next='allure-new';newResult.sections.find(s=>s.type==='filters').linkTarget='allure-new';data.states.push(newResult);newLive.next='result-new';
const newAllure=structuredClone(data.states.find(s=>s.id==='allure-view'));newAllure.id='allure-new';newAllure.title='Allure report · R-1044';newAllure.next='result-new';newAllure.sections[0].items=[['Passed','1','UI-001'],['Failed','1','UI-005'],['Skipped','0','Both selected tests executed'],['Pass rate','50.0%','1 / 2 executed']];newAllure.sections[1].rows=newAllure.sections[1].rows.filter(r=>!r[0].startsWith('UI-009'));newAllure.sections[1].target='result-new';data.states.push(newAllure);
fs.mkdirSync(path.join(root,'brand','icons'),{recursive:true});
fs.writeFileSync(path.join(root,'brand','logo-mark.svg'),data.logo);
fs.writeFileSync(path.join(root,'brand','favicon.svg'),data.logo.replace('width="48" height="48"','width="32" height="32"'));
fs.writeFileSync(path.join(root,'brand','logo-primary.svg'),svg(`<g>${data.logo.replace(/<svg[^>]*>|<\/svg>/g,'')}</g><text x="62" y="34" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="700" fill="#182237">Assertide</text>`,235,48));
for(const [name,asset] of Object.entries(data.icons))fs.writeFileSync(path.join(root,'brand','icons',name+'.svg'),asset);
for(const [name,asset] of Object.entries(data.mascots))fs.writeFileSync(path.join(root,'brand','mascot-'+name+'.svg'),asset);
fs.writeFileSync(path.join(root,'brand','tokens.json'),JSON.stringify({font:data.font,themes:data.themes,spacing:[4,8,12,16,24,32,48],radii:[8,12,16,24],type:{display:36,title:28,section:18,body:14,caption:12}},null,2));
fs.writeFileSync(path.join(root,'figma-plugin','content.js'),'const DESIGN = '+JSON.stringify(data)+';\n');
const engine=fs.readFileSync(path.join(root,'figma-plugin','engine.js'),'utf8');
fs.writeFileSync(path.join(root,'figma-plugin','code.js'),'const DESIGN = '+JSON.stringify(data)+';\n'+engine);
fs.writeFileSync(path.join(root,'preview-data.js'),'window.DESIGN = '+JSON.stringify(data)+';\n');
console.log(JSON.stringify({screens:data.screens.length,supportingStates:data.states.length,icons:Object.keys(data.icons).length,mascotPoses:Object.keys(data.mascots).length}));
