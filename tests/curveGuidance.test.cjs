const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const g = require('../calculators/curve/guidance.js');
const sizing = require('../calculators/curve/chevron-sizing.js');
const base = {method:'mmutcd',approachMPH:55,advisoryMPH:35,roadwayType:'arterial_with_markings',aadtKey:'4000_plus',surfaceType:'paved',roadType:'rcoc_primary'};
const guide = patch => g.deviceGuidance({...base,...patch});

test('MMUTCD Table 2C-4A: all 16 cells and Table B treatments', () => {
  const columns=['lt1000','1000_2999','3000_3999','4000_plus'];
  const rows={freeway_expressway:['Required','Required','Required','Required'],
    arterial_no_markings:['Optional','Recommended','Required','Required'],
    arterial_with_markings:['Optional','Recommended','Recommended','Required'],
    all_other:['Optional','Optional','Optional','Optional']};
  for(const [roadwayType,expected] of Object.entries(rows)) columns.forEach((aadtKey,i)=>assert.equal(guide({roadwayType,aadtKey}).need,expected[i]));
  for(const [delta,treatment,plaque] of [[5,'markings','Optional'],[10,'warning','Recommended'],[15,'delineators','Required'],[20,'chevrons','Required'],[25,'chevrons','Required']]){
    const r=guide({advisoryMPH:55-delta});
    assert.equal(r.treatment,treatment); assert.equal(r.plaque,plaque);
    assert.equal(r.showChevrons,delta>=20); assert.equal(r.showDelineators,delta===15);
  }
  assert.equal(guide({advisoryMPH:50,surfaceType:'gravel'}).showWarning,true);
  assert.equal(guide({advisoryMPH:50,pavedTreatment:'warning'}).showWarning,true);
  assert.equal(guide({advisoryMPH:50}).showWarning,false);
});

test('optional layouts, omitted devices and invalid speed pairs do not become required layouts', () => {
  assert.equal(guide({roadwayType:'all_other'}).showChevrons,false);
  assert.equal(guide({roadwayType:'all_other',includeOptional:true}).showChevrons,true);
  const omitted=guide({approachMPH:20,advisoryMPH:5,omitEligible:true});
  assert.equal(omitted.need,'Omitted by selection'); assert.equal(omitted.showDelineators,false);
  assert.equal(guide({urbanLowVolume:true,omitEligible:true,aadtKey:'lt1000'}).need,'Omitted by selection');
  assert.notEqual(guide({urbanLowVolume:true,omitEligible:true,roadwayType:'freeway_expressway',aadtKey:'lt1000'}).need,'Omitted by selection');
  assert.notEqual(guide({approachMPH:20,advisoryMPH:5,omitEligible:true,speedBasis:'85th'}).need,'Omitted by selection');
  for(const advisoryMPH of [55,60,0,NaN]) assert.equal(guide({advisoryMPH}).showChevrons,false);
});

test('MDOT Table 5 uses its own warning, plaque and chevron thresholds', () => {
  for(const [delta,warning,alignment] of [[5,'Recommended','Optional'],[10,'Required','Recommended'],[15,'Required','Required'],[20,'Required','Required'],[25,'Required','Required']]){
    const r=guide({method:'mdot',advisoryMPH:55-delta,aadtKey:'lt1000',roadwayType:'all_other'});
    assert.equal(r.warning,warning); assert.equal(r.plaque,warning); assert.equal(r.alignment,alignment);
    assert.equal(r.showChevrons,delta>=10); assert.equal(r.showDelineators,false);
  }
  assert.equal(guide({method:'mdot',advisoryMPH:50,includeOptional:true}).showChevrons,true);
  assert.equal(guide({method:'mdot',speedBasis:'85th'}).showWarning,false);
  assert.equal(guide({method:'mdot',roadType:'freeway_ramp',advisoryMPH:40}).rampSign,'Recommended');
});

test('chevron spacing follows the selected source and reports mismatched table rows', () => {
  assert.equal(g.chevronSpacing('mmutcd',1000,55).feet,160);
  assert.ok(Math.abs(g.chevronSpacing('mdot',1000,55).feet-184.932420089)<1e-8);
  for(const [radius,speed,feet] of [[199,15,40],[200,20,80],[400,30,80],[401,35,120],[700,45,120],[701,50,160],[1250,60,160],[1251,65,200]]){
    const r=g.chevronSpacing('mmutcd',radius,speed); assert.equal(r.feet,feet); assert.equal(r.mismatch,false);
  }
  assert.equal(g.chevronSpacing('mmutcd',1000,35).mismatch,true);
  assert.equal(g.chevronSpacing('mdot',50,15).feet,null);
});

test('advance placement distinguishes source values, Note 5, blank cells and site overrides', () => {
  assert.equal(g.advanceDistance('mdot',55,30).feet,275);
  assert.equal(g.advanceDistance('mmutcd',55,30).feet,200);
  assert.equal(g.advanceDistance('mmutcd',55,25).feet,225);
  assert.match(g.advanceDistance('mmutcd',55,25).note,/20 mph/);
  assert.equal(g.advanceDistance('mmutcd',25,20).feet,null);
  assert.match(g.advanceDistance('mmutcd',25,20).note,/Note 5/);
  assert.equal(g.advanceDistance('mdot',25,20).feet,null);
  assert.equal(g.advanceDistance('mdot',40,45).feet,null);
  assert.equal(g.advanceDistance('mdot',45,40).feet,100);
  assert.equal(g.advanceDistance('mmutcd',55,5).feet,null);
  assert.equal(g.advanceDistance('mmutcd',85,80).feet,150);
  assert.equal(g.advanceDistance('mdot',85,80).feet,null);
  const custom=g.advanceDistance('mmutcd',55,30,'250');
  assert.equal(custom.feet,250); assert.equal(custom.tableFeet,200); assert.equal(custom.custom,true);
});

test('delineators preserve minimum and maximum actual spacing on short and long curves', () => {
  for(const mode of ['snapEnds','centered','startAtA']) for(const radius of [20,50,100,500,1000,20000]) for(const length of [1,19,20,21,39,40,41,299,301,1000,5000]){
    const layout=g.delineatorLayout(length,radius,mode);
    assert.ok(layout.target>=20&&layout.target<=300);
    layout.positions.forEach(x=>assert.ok(x>=0&&x<=length+1e-8));
    for(let i=1;i<layout.positions.length;i++){
      const gap=layout.positions[i]-layout.positions[i-1];
      assert.ok(gap>=20-1e-8&&gap<=300+1e-8,`${mode} ${radius} ${length}: ${gap}`);
    }
    assert.equal(layout.approaches.length,3); assert.equal(layout.departures.length,3);
    assert.ok(layout.approaches.every(x=>x<0)); assert.ok(layout.departures.every(x=>x>length));
    assert.ok(layout.intervals.every(x=>x<=300));
    const all=[...layout.approaches,...layout.positions,...layout.departures].sort((a,b)=>a-b);
    for(let i=1;i<all.length;i++) assert.ok(all[i]-all[i-1]>=20-1e-8&&all[i]-all[i-1]<=300+1e-8,`Transition gap: ${mode} ${radius} ${length}`);
  }
  const r=g.delineatorLayout(200,150,'snapEnds'); // S=30: outward gaps 60,90,180
  assert.deepEqual(r.approaches,[-60,-150,-330]); assert.deepEqual(r.departures,[260,350,530]);
  assert.equal(g.delineatorLayout(19,150,'snapEnds').positions.length,1);
});

test('design equation uses the complete printed friction table without extrapolation', () => {
  assert.equal(g.sideFrictionAt(55),.13); assert.equal(g.sideFrictionAt(60),.12);
  assert.equal(g.sideFrictionAt(61),null); assert.equal(g.sideFrictionAt(14),null);
  for(const v of [15,20,25,30,35,40,45,50,55,60]){
    const e=.04, radius=v*v/(15*(e+g.sideFrictionAt(v)));
    const result=g.advisoryEstimate(radius,e);
    assert.ok(Math.abs(result.speed-v)<1e-7,`${v}: ${result.speed}`);
  }
  assert.equal(g.advisoryEstimate(20000,.04).speed,null);
  assert.equal(g.advisoryEstimate(20,0).speed,null);
});

test('MDOT R-127-I selects known-radius chart rows and closer location limits', () => {
  for (const [radius,target] of [[50,20],[149.9,20],[150,30],[949.9,80],[950,90],
    [1000,90],[1160,100],[1930,130],[9395,290],[10049.9,290],[10050,300],[17830,300],[17830.1,400]]) {
    assert.equal(g.mdotDelineatorSpacing(radius).target,target,`radius ${radius}`);
  }
  assert.equal(g.mdotDelineatorSpacing(49).target,null);
  assert.equal(g.mdotDelineatorSpacing(NaN).target,null);
  assert.equal(g.mdotDelineatorSpacing(10000,{context:'interchange'}).target,200);
  assert.equal(g.mdotDelineatorSpacing(10000,{context:'right_turn'}).target,100);
  assert.equal(g.mdotDelineatorSpacing(10000,{context:'normal',roadType:'freeway_ramp'}).target,100);
  assert.equal(g.mdotDelineatorSpacing(1000,{context:'ramp'}).target,90);
  const normal=g.delineatorLayout(1000,20000,'snapEnds',{method:'mdot'});
  assert.deepEqual(normal.intervals,[400,400,400]);
  assert.equal(normal.normalSpacing,true);
  const curve=g.delineatorLayout(1000,1000,'snapEnds',{method:'mdot'});
  assert.deepEqual(curve.intervals,[180,270,300]);
  const ramp=g.delineatorLayout(1000,1000,'snapEnds',{method:'mdot',roadType:'freeway_ramp'});
  assert.deepEqual(ramp.intervals,[100,100,100]);
  // Switching back preserves the MMUTCD formula, not the MDOT chart rounding.
  assert.ok(Math.abs(g.delineatorLayout(1000,1000,'snapEnds').target-3*Math.sqrt(950))<1e-9);
});

test('MDOT delineator layouts respect location caps through curve-to-tangent transitions', () => {
  for (const context of ['normal','interchange','ramp','right_turn'])
    for (const mode of ['snapEnds','centered','startAtA'])
      for (const radius of [50,150,1000,10050,17830,20000])
        for (const length of [1,19,20,39,100,301,499,1000,5000]) {
          const r=g.delineatorLayout(length,radius,mode,{method:'mdot',context});
          const positions=[...r.approaches,...r.positions,...r.departures].sort((a,b)=>a-b);
          for (let i=1;i<positions.length;i++) {
            const gap=positions[i]-positions[i-1];
            assert.ok(gap>=20-1e-8 && gap<=r.maximumGap+1e-8,`${context}, ${mode}, R=${radius}, L=${length}: ${gap}`);
          }
        }
});

test('MMUTCD sizing distinguishes expressway, freeway and conventional classifications', () => {
  for(const [roadType,roadwayType,w,h] of [['rcoc_local','all_other',18,24],['expressway_mainline','freeway_expressway',30,36],['freeway_mainline','freeway_expressway',36,48]]){
    const r=sizing.lookupChevronSizes({roadType,roadwayType,advisoryMPH:50});
    assert.deepEqual([r.mmutcd.width,r.mmutcd.height],[w,h]);
  }
});

test('calculation citations resolve to bundled source excerpts', () => {
  const entries=[...Object.values(g.sources.mmutcd),...Object.values(g.sources.mdot),g.sources.advisory].filter(Array.isArray);
  for(const [,url] of entries) assert.ok(fs.existsSync(path.join(__dirname,'../calculators/curve',url.split('#')[0])),url);
});
