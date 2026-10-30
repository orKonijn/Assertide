// Offline native Figma plugin. No network, rasterized UI or external dependencies.
// Components and frames are placed on one page to avoid Starter page-count limits.
async function build() {
 const existing=figma.root.children.find(p=>p.name==='Assertide · Product design');
 if(existing) throw new Error('Assertide page already exists. Preserve it; rename that page before intentionally generating another version.');
 const available=await figma.listAvailableFontsAsync();
 for(const style of ['Regular','Medium','Bold']) {
  if(!available.some(f=>f.fontName.family===DESIGN.font&&f.fontName.style===style))throw new Error('Required font unavailable: '+DESIGN.font+' '+style);
  await figma.loadFontAsync({family:DESIGN.font,style});
 }
 const page=figma.createPage(); page.name='Assertide · Product design'; await figma.setCurrentPageAsync(page);
 const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
 async function createVariableCollection(name,modeNames) {
  const collection=figma.variables.createVariableCollection(name),modeIds={};
  collection.renameMode(collection.modes[0].modeId,modeNames[0]);modeIds[modeNames[0]]=collection.modes[0].modeId;
  for(let i=1;i<modeNames.length;i++)modeIds[modeNames[i]]=collection.addMode(modeNames[i]);
  return {collection,modeIds};
 }
 const {collection:primitives,modeIds:pm}=await createVariableCollection('Assertide primitives',['Value']);
 const {collection:colors,modeIds:modes}=await createVariableCollection('Assertide semantic colors',['Light','Dark']);
 const vars={};
 for(const key of Object.keys(DESIGN.themes.Light)) {
  const v=figma.variables.createVariable('color/'+key,colors,'COLOR');
  v.scopes=key==='border'?['STROKE_COLOR']:['FRAME_FILL','SHAPE_FILL','TEXT_FILL'];v.setVariableCodeSyntax('WEB','var(--color-'+key+')');
  for(const theme of ['Light','Dark']) {
   const p=figma.variables.createVariable(theme+'/'+key,primitives,'COLOR');p.scopes=[];p.setVariableCodeSyntax('WEB','var(--primitive-'+theme.toLowerCase()+'-'+key+')');p.setValueForMode(pm.Value,rgb(DESIGN.themes[theme][key]));
   v.setValueForMode(modes[theme],{type:'VARIABLE_ALIAS',id:p.id});
  }
  vars[key]=v;
 }
 const {collection:dimensions,modeIds:dm}=await createVariableCollection('Assertide dimensions',['Value']);
 const dims={};
 for(const size of [4,8,12,16,24,32,48]){const v=figma.variables.createVariable('space/'+size,dimensions,'FLOAT');v.scopes=['GAP','CORNER_RADIUS'];v.setValueForMode(dm.Value,size);v.setVariableCodeSyntax('WEB','var(--space-'+size+')');dims[size]=v;}
 const styles={};for(const [name,size,weight] of [['Display',36,'Bold'],['Title',28,'Bold'],['Section',18,'Bold'],['Body',14,'Regular'],['Label',14,'Medium'],['Caption',12,'Regular']]){const s=figma.createTextStyle();s.name='Assertide/'+name;s.fontName={family:DESIGN.font,style:weight};s.fontSize=size;s.lineHeight={unit:'PERCENT',value:145};styles[name]=s;}
 function paint(key){return figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(DESIGN.themes.Light[key])},'color',vars[key]);}
 function txt(parent,str,style='Body',color='ink',width){const t=figma.createText();t.fontName={family:DESIGN.font,style:style==='Title'||style==='Display'||style==='Section'?'Bold':style==='Label'?'Medium':'Regular'};t.characters=String(str);t.textStyleId=styles[style].id;t.fills=[paint(color)];parent.appendChild(t);if(width){t.textAutoResize='HEIGHT';t.resize(width,t.height);}return t;}
 function box(parent,name,w,dir='VERTICAL',fill='surface',pad=24,gap=16){const f=figma.createFrame();f.name=name;f.layoutMode=dir;f.resize(w,20);f.primaryAxisSizingMode='AUTO';f.counterAxisSizingMode='FIXED';f.fills=fill?[paint(fill)]:[];f.setBoundVariable('itemSpacing',dims[gap]||dims[16]);for(const p of ['paddingTop','paddingBottom','paddingLeft','paddingRight'])f.setBoundVariable(p,dims[pad]||dims[4]);if(!pad)f.paddingTop=f.paddingBottom=f.paddingLeft=f.paddingRight=0;f.cornerRadius=12;if(fill)f.setBoundVariable('cornerRadius',dims[12]);parent.appendChild(f);return f;}
 const foundations=box(page,'00 · Brand and foundations',1440);foundations.x=240;foundations.y=160;
 txt(foundations,'Assertide','Display');txt(foundations,DESIGN.tagline,'Section','brand');txt(foundations,'Editable design generation · illustrative data · native Figma validation required','Body','muted');
 const artRow=box(foundations,'Brand assets',1392,'HORIZONTAL',null,0,24);
 const logo=figma.createComponent();logo.name='Brand/Mark';logo.resize(48,48);logo.fills=[];logo.appendChild(figma.createNodeFromSvg(DESIGN.logo));artRow.appendChild(logo);
 const mascots={};for(const [pose,source] of Object.entries(DESIGN.mascots)){const c=figma.createComponent();c.name='Mascot/'+pose;c.resize(180,180);c.fills=[];c.appendChild(figma.createNodeFromSvg(source));c.description='Pip, the Assertide verification companion. '+pose+' pose.';artRow.appendChild(c);mascots[pose]=c;}
 const iconRow=box(foundations,'Icon library',1392,'HORIZONTAL',null,0,16);iconRow.layoutWrap='WRAP';const icons={};
 for(const [name,source] of Object.entries(DESIGN.icons)){const c=figma.createComponent();c.name='Icon/'+name;c.resize(24,24);c.fills=[];const art=figma.createNodeFromSvg(source);c.appendChild(art);for(const n of art.findAll(n=>'strokes' in n))if(Array.isArray(n.strokes)&&n.strokes.length)n.strokes=[paint('muted')];iconRow.appendChild(c);icons[name]=c;}
 const swatchRow=box(foundations,'Theme tokens',1392,'HORIZONTAL',null,0,16);swatchRow.layoutWrap='WRAP';
 for(const key of Object.keys(vars)){const b=box(swatchRow,'Token/'+key,160,'VERTICAL',key,16,8);txt(b,key,'Caption',key==='ink'||key==='code'?'surface':'ink',128);}
 txt(foundations,'Inter · 36 / 28 / 18 / 14 / 12 · 4px spacing system','Body');
 txt(foundations,'A: Login → Projects → Suites → Explorer → Configure → Live → Result → Allure tab. B: API → API live → API result. C: History → Result → Rerun configuration → Live.','Body','muted',1392);
 const library=box(page,'01 · Reusable components',1440);library.x=1800;library.y=160;
 txt(library,'Component library','Title');
 const components={};
 function component(name,w,h,fill){const c=figma.createComponent();c.name=name;c.resize(w,h);c.layoutMode='HORIZONTAL';c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';c.fills=[paint(fill)];c.setBoundVariable('cornerRadius',dims[8]);c.setBoundVariable('paddingLeft',dims[16]);c.setBoundVariable('paddingRight',dims[16]);library.appendChild(c);return c;}
 const buttons=[];for(const state of ['Default','Hover','Focus','Disabled','Loading']){const c=component('State='+state,216,44,state==='Disabled'?'soft':'brand');txt(c,state==='Loading'?'Starting…':'Continue','Label',state==='Disabled'?'muted':'onBrand');if(state==='Focus'){c.strokes=[paint('brand')];c.strokeWeight=3;c.strokeAlign='OUTSIDE';}buttons.push(c);}
 const buttonSet=figma.combineAsVariants(buttons,library);buttonSet.name='Button';buttonSet.layoutMode='HORIZONTAL';buttonSet.itemSpacing=16;buttonSet.primaryAxisSizingMode='AUTO';components.button=buttons[0];
 const badges=[];for(const status of ['Passed','Failed','Running','Queued','Skipped','Canceled','Broken']){const c=component('Status='+status,120,32,'soft');txt(c,status,'Caption',status==='Passed'?'success':status==='Failed'||status==='Broken'?'danger':status==='Running'?'brand':'muted');badges.push(c);}
 const badgeSet=figma.combineAsVariants(badges,library);badgeSet.name='Status';badgeSet.layoutMode='HORIZONTAL';badgeSet.itemSpacing=8;badgeSet.primaryAxisSizingMode='AUTO';
 const metric=figma.createComponent();metric.name='Metric card';metric.layoutMode='VERTICAL';metric.resize(240,130);metric.primaryAxisSizingMode='AUTO';metric.paddingTop=metric.paddingBottom=metric.paddingLeft=metric.paddingRight=24;metric.itemSpacing=8;metric.fills=[paint('surface')];metric.strokes=[paint('border')];metric.setBoundVariable('cornerRadius',dims[12]);library.appendChild(metric);txt(metric,'Metric label','Caption','muted',192);txt(metric,'96.9%','Title');txt(metric,'Denominator','Caption','muted',192);components.metric=metric;
 const input=figma.createComponent();input.name='Field';input.layoutMode='VERTICAL';input.resize(350,80);input.primaryAxisSizingMode='AUTO';input.itemSpacing=8;input.fills=[];library.appendChild(input);txt(input,'Field label','Caption','muted',350);const inputValue=box(input,'Value',350,'HORIZONTAL','soft',16,8);txt(inputValue,'Selected value','Body','ink',318);components.input=input;
 const nav=component('Navigation item',184,44,'soft');nav.primaryAxisAlignItems='MIN';nav.itemSpacing=12;const navIcon=icons.overview.createInstance();nav.appendChild(navIcon);const swap=nav.addComponentProperty('Icon','INSTANCE_SWAP',icons.overview.id);navIcon.componentPropertyReferences={mainComponent:swap};txt(nav,'Overview','Label');components.nav=nav;
 function instance(parent,main,values,width){const i=main.createInstance();parent.appendChild(i);const texts=i.findAllWithCriteria({types:['TEXT']});values.forEach((v,n)=>{if(texts[n])texts[n].characters=String(v);});if(width){i.resize(width,i.height);for(const t of texts){t.textAutoResize='HEIGHT';t.resize(Math.max(40,width-(main===metric?48:0)),t.height);}}return i;}
 function button(parent,label){return instance(parent,components.button,[label]);}
 const links=[],frames={},all=[...DESIGN.screens,...DESIGN.states];
 function section(parent,s,w,mobile){
  if(s.type==='filters'){const r=box(parent,'Filters',w,'HORIZONTAL',null,0,8);r.layoutWrap='WRAP';for(const item of s.items){const chip=box(r,'Filter',Math.min(w,Math.max(90,item.length*7+30)),'HORIZONTAL','soft',12,8);txt(chip,item,'Caption','muted');if(item==='Open Allure')links.push([chip,s.linkTarget||'allure-view']);}return;}
  if(s.type==='metrics'||s.type==='cards'){const row=box(parent,s.type,w,mobile?'VERTICAL':'HORIZONTAL',null,0,16);const cw=mobile?w:(w-16*(s.items.length-1))/s.items.length;for(const item of s.items){if(s.type==='metrics')instance(row,metric,item,cw);else{const c=box(row,'Insight card',cw,'VERTICAL','surface',24,8);c.strokes=[paint('border')];txt(c,item[0],'Caption','muted',cw-48);txt(c,item[1],'Section','ink',cw-48);txt(c,item[2],'Caption','muted',cw-48);}}return;}
  const card=box(parent,s.title||s.type,w,'VERTICAL',s.type==='code'?'code':'surface',24,16);if(s.type!=='code')card.strokes=[paint('border')];const iw=w-48;
  if(s.title){const t=txt(card,s.title,'Section','ink',iw);if(s.type==='code')t.fills=[{type:'SOLID',color:rgb('#F0F3FA')}];}
  if(s.type==='notice'){txt(card,s.body,'Body','muted',iw);if(s.target){const b=button(card,'Review cancellation');links.push([b,s.target]);}}
  if(s.type==='hero'){const i=mascots[s.pose].createInstance();card.appendChild(i);txt(card,s.body,'Body','muted',iw);}
  if(s.type==='form')for(const [label,value] of s.fields){const i=instance(card,input,[label,value],iw);const v=i.findOne(n=>n.name==='Value');if(v&&v.type==='FRAME'){v.resize(iw,v.height);const t=v.findOne(n=>n.type==='TEXT');if(t&&t.type==='TEXT'){t.textAutoResize='HEIGHT';t.resize(iw-32,t.height);}}}
  if(s.type==='code'){const t=txt(card,s.body,'Body','ink',iw);t.fills=[{type:'SOLID',color:rgb('#F0F3FA')}];}
  if(s.type==='table'){
   if(!mobile){const header=box(card,'Table header',iw,'HORIZONTAL','soft',12,8);for(const col of s.columns)txt(header,col,'Caption','muted',(iw-24-8*(s.columns.length-1))/s.columns.length);}
   for(const row of s.rows){const line=box(card,'Table row',iw,mobile?'VERTICAL':'HORIZONTAL',null,0,8);row.forEach((value,i)=>{txt(line,mobile?s.columns[i]+': '+value:value,'Body',/^(Failed|Broken)$/.test(value)?'danger':value==='Passed'?'success':'ink',mobile?iw:(iw-8*(row.length-1))/row.length);});if(s.target)links.push([line,s.target]);}
  }
  if(s.type==='progress'){txt(card,s.body,'Body','muted',iw);const track=figma.createFrame();track.resize(iw,10);track.fills=[paint('soft')];track.cornerRadius=5;card.appendChild(track);const bar=figma.createRectangle();bar.resize(iw*s.value/100,10);bar.fills=[paint('brand')];bar.cornerRadius=5;track.appendChild(bar);txt(card,s.value+'% complete','Caption','brand');}
  if(s.type==='chart'){
   txt(card,s.body,'Caption','muted',iw);const chart=figma.createFrame();chart.name='Editable trend plot';chart.resize(iw,190);chart.fills=[];card.appendChild(chart);
   const points=arr=>arr.map((v,i)=>`${i*(iw-12)/6+6},${170-(v-80)*7}`).join(' ');
   const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="190" viewBox="0 0 ${iw} 190"><path d="M0 30H${iw} M0 100H${iw} M0 170H${iw}" stroke="#D8DFEA"/><polyline points="${points(s.secondary)}" fill="none" stroke="#147455" stroke-width="3" stroke-dasharray="5 5"/><polyline points="${points(s.series)}" fill="none" stroke="#5145CD" stroke-width="4"/></svg>`;
   const plot=figma.createNodeFromSvg(source);chart.appendChild(plot);for(const n of plot.findAll(n=>'strokes' in n)){if(Array.isArray(n.strokes)&&n.strokes.length){const p=n.strokes[0];if(p.type==='SOLID'){const key=p.color.r>0.7?'border':p.color.g>0.35?'success':'brand';n.strokes=[paint(key)];}}}txt(card,'23 Oct     24 Oct     25 Oct     26 Oct     27 Oct     28 Oct     29 Oct','Caption','muted',iw);txt(card,'Solid: final pass · Dashed: first attempt · sample chart','Caption','muted',iw);
  }
 }
 for(const [themeIndex,theme] of ['Light','Dark'].entries())for(const [sizeIndex,mobile] of [false,true].entries())for(const [idx,s] of all.entries()){
  const w=mobile?390:1440,key=theme+'/'+(mobile?'Mobile':'Desktop')+'/'+s.id;
  const frame=box(page,key,w,'HORIZONTAL','canvas',0,0);frame.itemSpacing=0;frame.cornerRadius=0;frame.setExplicitVariableModeForCollection(colors,modes[theme]);frame.x=240+(idx%4)*(w+120)+(mobile?6500:0);frame.y=1100+Math.floor(idx/4)*2200+themeIndex*15000;
  frames[key]=frame;
  if(!mobile&&s.id!=='login'){const side=box(frame,'Sidebar',224,'VERTICAL','surface',24,12);side.appendChild(logo.createInstance());txt(side,'Assertide','Section');txt(side,'MERIDIAN ENGINEERING','Caption','muted',176);for(const [id,label,icon] of DESIGN.navigation){const item=instance(side,nav,[label],176);item.setProperties({[swap]:icons[icon].id});links.push([item,id,key]);}txt(side,'Local sandbox\nApproved environment','Caption','muted',176);}
  const cw=mobile?w:(s.id==='login'?w:w-224),main=box(frame,'Content',cw,'VERTICAL',null,mobile?16:32,24),iw=cw-(mobile?32:64);
  if(mobile){const top=box(main,'Mobile navigation',iw,'HORIZONTAL',null,0,12);top.appendChild(logo.createInstance());txt(top,'Assertide','Section');const menu=button(main,'Menu / Projects');links.push([menu,'projects',key]);}
  txt(main,s.eyebrow,'Caption','brand',iw);txt(main,s.title,'Title','ink',iw);txt(main,s.subtitle,'Body','muted',iw);
  const primary=button(main,s.action);links.push([primary,s.next,key]);
  const start=links.length;for(const sec of s.sections)section(main,sec,iw,mobile);for(let j=start;j<links.length;j++)if(!links[j][2])links[j][2]=key;
  txt(main,'Design fixture · no tests executed · '+theme+' / '+(mobile?'390px':'1440px'),'Caption','muted',iw);
 }
 let themeY=1100;for(const theme of ['Light','Dark']){let bottom=themeY;for(const mobile of [false,true]){let y=themeY;for(let start=0;start<all.length;start+=4){const row=all.slice(start,start+4).map(s=>frames[theme+'/'+(mobile?'Mobile':'Desktop')+'/'+s.id]);row.forEach((f,i)=>{f.x=240+(mobile?6500:0)+i*((mobile?390:1440)+120);f.y=y;});y+=Math.max(...row.map(f=>f.height))+160;}bottom=Math.max(bottom,y);}themeY=bottom+320;}
 for(const [node,target,key] of links){const prefix=key?key.split('/').slice(0,2).join('/'):'Light/Desktop';const dest=frames[prefix+'/'+target];if(dest)await node.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:dest.id,navigation:'NAVIGATE',transition:{type:'DISSOLVE',duration:0.2,easing:{type:'EASE_OUT'}}}]}]);}
 const fontMismatches=page.findAllWithCriteria({types:['TEXT']}).filter(t=>t.fontName===figma.mixed||t.fontName.family!==DESIGN.font).length;
 const ledger={pageId:page.id,frames:Object.fromEntries(Object.entries(frames).map(([k,v])=>[k,v.id])),screenCount:Object.keys(frames).length,componentCount:page.findAllWithCriteria({types:['COMPONENT']}).length,instanceCount:page.findAllWithCriteria({types:['INSTANCE']}).length,fontMismatches,imageFilledNodes:page.findAll(n=>Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).length};
 console.log('ASSERTIDE_DESIGN_LEDGER',JSON.stringify(ledger));
 figma.currentPage.selection=[frames['Light/Desktop/dashboard']];figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
 figma.closePlugin('Created '+ledger.screenCount+' editable screen/state frames. Inspect rendering and prototype paths before acceptance.');
}
build().catch(error=>{console.error(error);figma.closePlugin('Build stopped: '+error.message+'. Any partial page was preserved for inspection.');});
