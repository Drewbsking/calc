# Graph.py Requirements and Usage

## Purpose

`Graph.py` reads a Civil 3D HTML report and creates a station/offset graphic showing:

- stacked access-point density bars by category
- offset points along the alignment
- vertical reference lines for Major and Minor roads

The output image is:

- `access_point_station_density_no_offset.png`

## Source Report

The input report comes from Autodesk Civil 3D:

- `Toolspace`
- `Toolbox`
- `Reports Manager`
- `Points`
- `Station/Offset to Points`

Export that report as an HTML file.

Place the HTML report in the same folder as `Graph.py` and name it:

- `CivilReport.html`

Note: the current folder also contains `civilreport.html`. On Windows this still works because the file system is not case-sensitive, but the intended file name for the script is `CivilReport.html`.

## Python Requirements

`Graph.py` requires:

- Python 3
- `pandas`
- `numpy`
- `matplotlib`
- `beautifulsoup4`

Install them with:

```powershell
py -m pip install pandas numpy matplotlib beautifulsoup4
```

## Expected Report Format

The script expects the HTML report table to contain these columns:

1. `Point`
2. `Station`
3. `Offset`
4. `Elevation`
5. `Description`

The script uses:

- `Station` for x-position along the alignment
- `Offset` for left/right distance from the alignment
- `Description` to classify points

## How Classification Works

The script reads the raw description inside the Civil 3D description field and assigns categories as follows:

- `Major` when the raw description starts with `Major`
- `Minor` when the raw description starts with `Minor`
- `Residential` when the raw description contains `residential`
- `Commercial` when the raw description contains `commercial`
- anything else becomes `Named streets that are NOT primary or Local roads`

## Major and Minor Road Logic

For Major and Minor roads, the script draws vertical reference lines.

If the same road name appears on both sides of the alignment, meaning:

- at least one positive offset
- at least one negative offset

the script averages the station and shows one vertical line.

If repeated points are all on the same side, the script keeps them separate.

## Current Graph Behavior

The graph currently does the following:

- creates 1,000-foot stacked density bars for:
  - `Minor`
  - `Major`
  - `Residential`
  - `Commercial`
- plots all categorized points by signed offset
- makes Minor road reference lines lighter than Major road reference lines
- labels merged or individual Major/Minor road lines at the top of the chart

## How to Run

From the same folder as `Graph.py`, run:

```powershell
py Graph.py
```

If successful, the script writes:

```text
Created C:\Users\abates\OneDrive - Road Commission for Oakland County\Desktop\Dixie\access_point_station_density_no_offset.png
```

## File Locations

Expected files in the same folder:

- `Graph.py`
- `CivilReport.html`

Created output:

- `access_point_station_density_no_offset.png`

## Notes

- The alignment length is currently hard-coded to `50107.02` feet.
- The density bin width is currently hard-coded to `1000` feet.
- If the Civil 3D report structure changes, the HTML parsing logic in `Graph.py` may need to be updated.
