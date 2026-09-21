# Sight line tools

Two browser tools port the supplied Python scripts without requiring Python, matplotlib, a server API, or a chart library:

- `Sight Line Elevation Checker.py` becomes [Sight Line Elevation Checker](../sightLineElevation.html).
- `against actual ground elevations.py` becomes [Sight Line vs. Ground Profile](../sightLineProfile.html).

Both are listed under Sight Distance on the home page and link to each other. Their related-tool links carry the current eye elevation, target elevation, and total distance. The original Python files are retained as references.

## Calculations and input conventions

Shared calculations are in `scripts/sightLineCore.js`. The formula is unchanged:

```text
Z(x) = Zeye + (Ztarget - Zeye) * (x / L)
clearance = Z(x) - Zground
```

Endpoint inputs are elevations in feet on a common datum, including eye/target heights above their ground elevations. The distance origin is the eye; x and L use the same measurement basis. Elevations may be negative. L must be positive and all check/ground distances must be within [0, L]. Blank and nonfinite values are rejected, and invalid edits hide previous results.

The profile accepts comma- or tab-separated distance/elevation pairs, with an optional `Distance,Elevation` header. Empty lines are ignored. Points are sorted, duplicate distances are rejected, and a single ground point can be compared without inventing a ground segment. Ground is drawn only across the entered range. Positive clearance means ground below the sight line; negative means ground above; zero is labeled as touching. Decisions use unrounded values.

The SVG chart uses separate horizontal and vertical scales, explicitly labeled. It shades only the parts of interpolated ground segments above the sight line, calculating exact crossings within each segment. It does not extrapolate terrain to unmeasured endpoints or claim the entire sight path is clear. A results table provides the same point values in text; CSV export retains the unrounded numeric results.

## Verification

```powershell
node --test tests/sightLine.test.cjs
py -3.13 tests/sight_line_browser.py
```

The optional browser check uses Playwright, starts its own local HTTP server, verifies both pages and the home-page category filter, exercises validation and CSV export, and checks mobile overflow. Screenshots are saved under the system temporary directory, not the repository.
