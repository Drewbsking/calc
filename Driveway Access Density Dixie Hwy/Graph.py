import pandas as pd
import numpy as np
import re
from bs4 import BeautifulSoup
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

script_dir = Path(__file__).resolve().parent
html_path = script_dir / "CivilReport.html"
out_png = script_dir / "access_point_station_density_no_offset.png"

if not html_path.is_file():
    raise FileNotFoundError(f"Input file not found: {html_path}")

html = html_path.read_text(errors="ignore")
soup = BeautifulSoup(html, "html.parser")

# Extract table rows
rows = []
for tr in soup.find_all("tr"):
    cells = [td.get_text(strip=True) for td in tr.find_all("td")]
    if len(cells) == 5 and cells[0].isdigit():
        rows.append(cells)

df = pd.DataFrame(rows, columns=["Point", "Station", "Offset", "Elevation", "Description"])
df["Point"] = df["Point"].astype(int)

def station_to_feet(s):
    # Civil station format like 343+44.12 -> 34,344.12 ft
    m = re.match(r"^\s*(\d+)\+([0-9.]+)\s*$", s)
    if not m:
        return np.nan
    return int(m.group(1)) * 100 + float(m.group(2))

def offset_to_feet(s):
    # Report format is a signed number followed by a foot mark, e.g. -47.00'
    try:
        return float(s.replace(",", "").rstrip("'").strip())
    except ValueError:
        return np.nan

def split_description(d):
    """Split Civil Report's '(Raw Desc.)Description' value."""
    text = d.strip()
    if not text.startswith("("):
        return text, text

    # Find the closing parenthesis paired with the first one. Raw Desc. can
    # contain nested values such as "Davisburg (Major)".
    depth = 0
    for i, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                raw = text[1:i].strip()
                label = text[i + 1:].strip()
                return raw, label or raw

    return text, text

df["Station_ft"] = df["Station"].apply(station_to_feet)
df["Offset_ft"] = df["Offset"].apply(offset_to_feet)
df["Mile"] = df["Station_ft"] / 5280
df[["Raw_Desc", "Label"]] = df["Description"].apply(
    lambda d: pd.Series(split_description(d))
)
df = df.dropna(subset=["Station_ft", "Offset_ft"]).copy()

def normalize_access_name(raw_description):
    return re.sub(r"^\s*(Major|Minor)\s+", "", raw_description, flags=re.I).strip()

# Classification
def access_type(raw_description):
    low = raw_description.lower()
    if re.match(r"^\s*major\b", low):
        return "Major"
    if re.match(r"^\s*minor\b", low):
        return "Minor"
    if "commercial" in low:
        return "Commercial"
    if "residential" in low:
        return "Residential"
    return "Named streets that are NOT primary or Local roads"

df["Type"] = df["Raw_Desc"].apply(access_type)
df["Access_Name"] = df["Raw_Desc"].apply(normalize_access_name)

def build_road_points(group):
    road_type, access_name = group.name
    has_positive = (group["Offset_ft"] > 0).any()
    has_negative = (group["Offset_ft"] < 0).any()

    # Only split the difference when the same road exists on opposite sides.
    if has_positive and has_negative:
        return pd.DataFrame([{
            "Type": road_type,
            "Access_Name": access_name,
            "Station_ft": group["Station_ft"].mean(),
            "Offset_ft": group["Offset_ft"].mean(),
        }])

    kept = group[["Station_ft", "Offset_ft"]].copy()
    kept.insert(0, "Access_Name", access_name)
    kept.insert(0, "Type", road_type)
    return kept

road_points = (
    df[df["Type"].isin(["Major", "Minor"])]
    .groupby(["Type", "Access_Name"], group_keys=False)
    .apply(build_road_points)
    .sort_values("Station_ft")
    .reset_index(drop=True)
)

# 1,000-ft density bins across user-provided alignment length
alignment_length = 50107.02
bin_width = 1000
bins = np.arange(0, alignment_length + bin_width, bin_width)
stack_order = ["Minor", "Major", "Residential", "Commercial"]
stack_colors = {
    "Minor": "tab:blue",
    "Major": "tab:red",
    "Residential": "tab:green",
    "Commercial": "tab:orange",
}
stack_counts = {
    category: np.histogram(df.loc[df["Type"] == category, "Station_ft"], bins=bins)[0]
    for category in stack_order
}
counts = np.sum([stack_counts[category] for category in stack_order], axis=0)
edges = bins
centers = (edges[:-1] + edges[1:]) / 2
summary = pd.DataFrame({
    "Start_ft": edges[:-1],
    "End_ft": edges[1:],
    "Start_station": [f"{int(x//100)}+{x%100:05.2f}" for x in edges[:-1]],
    "End_station": [f"{int(min(x, alignment_length)//100)}+{min(x, alignment_length)%100:05.2f}" for x in edges[1:]],
    "Access_points": counts
})

df = df.sort_values("Station_ft").reset_index(drop=True)

fig, ax1 = plt.subplots(figsize=(22, 8))

# Density bars behind as stacked categories
bar_bottom = np.zeros_like(counts)
for category in stack_order:
    ax1.bar(
        centers,
        stack_counts[category],
        bottom=bar_bottom,
        width=bin_width * 0.92,
        alpha=0.28,
        color=stack_colors[category],
        label=f"{category} per 1,000 ft",
    )
    bar_bottom = bar_bottom + stack_counts[category]
ax1.set_ylabel("Access points per 1,000 ft")
ax1.set_xlabel("Station along alignment (feet)")
ax1.set_xlim(0, alignment_length)
ax1.grid(axis="y", alpha=0.25)

# Plot each access point at its actual signed offset from the alignment.
ax2 = ax1.twinx()
for t in ["Residential", "Commercial", "Major", "Minor", "Named streets that are NOT primary or Local roads"]:
    subset = df[df["Type"] == t]
    if not subset.empty:
        if t == "Major":
            ax2.scatter(
                subset["Station_ft"],
                subset["Offset_ft"],
                marker="|",
                s=300,
                linewidths=2.2,
                alpha=0.9,
                label=t,
            )
        elif t == "Minor":
            ax2.scatter(
                subset["Station_ft"],
                subset["Offset_ft"],
                marker="|",
                s=220,
                linewidths=1.5,
                alpha=0.35,
                label=t,
            )
        else:
            ax2.scatter(
                subset["Station_ft"],
                subset["Offset_ft"],
                s=28,
                alpha=0.8,
                label=t,
            )
offset_limit = max(10, float(df["Offset_ft"].abs().max()) * 1.1)
ax2.set_ylim(-offset_limit, offset_limit)
ax2.axhline(0, color="black", linewidth=1, alpha=0.45)
ax2.set_ylabel("Offset from alignment (ft)")

# Draw one vertical line per merged Major/Minor road. Minor lines are fainter.
for _, r in road_points.iterrows():
    x = r["Station_ft"]
    is_major = r["Type"] == "Major"
    ax1.axvline(
        x,
        linewidth=1.8 if is_major else 1.1,
        alpha=0.70 if is_major else 0.30,
        color="tab:red" if is_major else "tab:blue",
    )
    ax1.text(
        x,
        max(counts)*1.03 if len(counts) else 1,
        r["Access_Name"],
        rotation=90,
        va="bottom",
        ha="center",
        fontsize=7.5,
        fontweight="bold" if is_major else "normal",
        color="tab:red" if is_major else "tab:blue",
        alpha=0.90 if is_major else 0.55,
        clip_on=False,
    )

max_count = int(counts.max()) if len(counts) else 0
top_bin = summary.loc[summary["Access_points"].idxmax()]
title = "Access Point Density and Offset Along Alignment"
subtitle = (
    f"{len(df)} access points over 50,107.02 ft. "
    f"Highest 1,000-ft bin: {top_bin['Start_station']} to {top_bin['End_station']} "
    f"with {int(top_bin['Access_points'])} points."
)
fig.suptitle(title, fontsize=16, fontweight="bold")
fig.text(0.5, 0.94, subtitle, ha="center", va="top", fontsize=11)

# combined legend
h1, l1 = ax1.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
fig.legend(h1 + h2, l1 + l2, loc="upper right", bbox_to_anchor=(0.985, 0.985))

# Better station tick labels every 5,000 ft
ticks = np.arange(0, alignment_length + 1, 5000)
ax1.set_xticks(ticks)
ax1.set_xticklabels([f"{int(t//100)}+{t%100:05.2f}" for t in ticks], rotation=45, ha="right")

fig.tight_layout(rect=[0, 0, 1, 0.88])
fig.savefig(out_png, dpi=200, bbox_inches="tight")
plt.close(fig)

print(f"Created {out_png}")
