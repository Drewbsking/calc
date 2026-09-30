(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./units.js') : root.CPUnits);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPQuantity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U) {
  'use strict';
  function volumeCF(areaSF, inches) { return U.number(areaSF, 'Area') * U.number(inches, 'Thickness', true) / 12; }
  function concreteCY(areaSF, inches) { return volumeCF(areaSF, inches) / 27; }
  function hmaTons(areaSF, inches, density = 145) { return volumeCF(areaSF, inches) * U.number(density, 'Density', true) / 2000; }
  function derive(projectQuantity, projectUnit, op, density = 145) {
    const n = U.number(projectQuantity, 'Project quantity');
    const f = value => Number(Number(value).toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 });
    let quantity, formula, extras = {};
    switch (op.transform) {
      case 'fixed':
        quantity = U.number(op.quantity, `${op.name} quantity`);
        formula = `${f(quantity)} ${op.unit} (fixed; independent of project quantity)`;
        break;
      case 'factor':
        quantity = n * U.number(op.factor, `${op.name} quantity factor`, true);
        formula = `${f(n)} ${projectUnit} × ${f(op.factor)} ${op.unit}/${projectUnit} = ${f(quantity)} ${op.unit}`;
        break;
      case 'volume':
      case 'hma': {
        const areaSF = U.convert(n, projectUnit, 'SF');
        const cf = volumeCF(areaSF, op.thickness);
        extras = { areaSF, areaSY: areaSF / 9, volumeCF: cf, volumeCY: cf / 27, thickness: Number(op.thickness) };
        if (op.transform === 'volume') {
          quantity = U.convert(cf, 'CF', op.unit);
          formula = `${f(areaSF)} SF × ${f(op.thickness)}/12 = ${f(cf)} CF; ${f(cf)} CF = ${f(quantity)} ${op.unit}`;
        } else {
          extras.tons = hmaTons(areaSF, op.thickness, density);
          quantity = U.convert(extras.tons, 'Tons', op.unit);
          formula = `${f(areaSF)} SF × ${f(op.thickness)}/12 × ${f(density)} LB/CF ÷ 2,000 = ${f(extras.tons)} Tons = ${f(quantity)} ${op.unit}`;
        }
        break;
      }
      case 'direct':
        quantity = U.convert(n, projectUnit, op.unit);
        formula = `${f(n)} ${projectUnit} × ${f(U.convert(1, projectUnit, op.unit))} ${op.unit}/${projectUnit} = ${f(quantity)} ${op.unit}`;
        break;
      default: throw new Error(`${op.name}: choose a quantity transformation.`);
    }
    if (!Number.isFinite(quantity)) throw new Error(`${op.name}: quantity is too large.`);
    return { quantity, formula, ...extras };
  }
  return { volumeCF, concreteCY, hmaTons, derive };
});
