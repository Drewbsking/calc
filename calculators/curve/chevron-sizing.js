(function(root){
  'use strict';

  // RCOC local/primary sizes supplied by the agency for this calculator.
  // MDOT Traffic Sign Design, Placement, and Application Guidelines,
  // Table 2 (2023), and Appendix B-9. Dimensions are width x height in inches.
  const ROAD_TYPES = ['conventional', 'freeway_mainline', 'expressway_mainline', 'freeway_expressway', 'freeway_ramp'];
  const ROADWAY_CLASSES = ['freeway_expressway', 'arterial_no_markings', 'arterial_with_markings', 'all_other'];
  const size = (width, height, rationale) => ({ width, height, rationale });

  function lookupRcocChevronSize(classification){
    if (classification === 'local') return size(18, 24, 'RCOC local road');
    if (classification === 'primary') return size(24, 30, 'RCOC primary road');
    return null;
  }

  function lookupChevronSizes({ roadType, roadwayType, advisoryMPH } = {}){
    const result = { mdot: null, mmutcd: null, message: '', conflict: false };
    if (!ROAD_TYPES.includes(roadType)) {
      result.message = 'Select a road type for chevron sizing.';
      return result;
    }
    if (!ROADWAY_CLASSES.includes(roadwayType)) {
      result.message = 'Select an MMUTCD roadway class to cross-check sizing.';
      return result;
    }

    const isFreeway = ['freeway_mainline', 'expressway_mainline', 'freeway_expressway', 'freeway_ramp'].includes(roadType);
    if (isFreeway !== (roadwayType === 'freeway_expressway')) {
      result.conflict = true;
      result.message = isFreeway
        ? 'Road type and MMUTCD roadway class disagree. Select Freeway or expressway as the MMUTCD class, or correct the road type.'
        : 'Road type and MMUTCD roadway class disagree. Select a conventional-road MMUTCD class, or correct the road type.';
      return result;
    }

    if (!isFreeway) {
      result.mdot = size(24, 30, 'Conventional roadway');
      result.mmutcd = size(18, 24, 'Conventional roadway; Table 2C-1');
    } else if (roadType !== 'freeway_ramp') {
      result.mdot = size(36, 48, 'Freeway or expressway mainline');
      result.mmutcd = roadType === 'expressway_mainline'
        ? size(30, 36, 'Expressway; Table 2C-1')
        : size(36, 48, 'Freeway; Table 2C-1');
    } else {
      result.mmutcdNote = 'Table 2C-1 has no separate speed-based ramp row. Confirm the applicable roadway size for this ramp.';
      const advisory = Number(advisoryMPH);
      if (Number.isFinite(advisory) && advisory > 0 && advisory <= 40) {
        result.mdot = size(24, 30, `Freeway ramp; selected advisory speed ${advisory} mph`);
      } else if (Number.isFinite(advisory) && advisory >= 45 && advisory <= 55) {
        result.mdot = size(36, 48, `Freeway ramp; selected advisory speed ${advisory} mph`);
      } else {
        result.mdotNote = 'The MDOT guide lists ramp sizes for advisory speeds of 40 mph or less and 45–55 mph. Confirm the size for this ramp speed.';
      }
    }
    return result;
  }

  if (typeof module === 'object' && module.exports) module.exports = { lookupChevronSizes, lookupRcocChevronSize };
  else root.CurveChevronSizing = { lookupChevronSizes, lookupRcocChevronSize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
